import { daysBetweenUtc, utcDayKey } from './clock.ts';
import type {
  CatalogIndicator,
  CatalogSymptom,
  CrewMember,
  MeasurementRecord,
  OverallStatus,
  Status,
  ThresholdBand,
  TrendDirection,
} from '../shared/types.ts';

const STATUS_RANK: Record<OverallStatus, number> = {
  no_data: -1,
  normal: 0,
  watch: 1,
  alert: 2,
};

export function worseStatus(a: OverallStatus, b: OverallStatus): OverallStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

export function worseConcreteStatus(a: Status, b: Status): Status {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

export function bandStatus(value: number, bands: ThresholdBand[]): Status {
  for (const band of bands) {
    const gteOk = band.gte === undefined || value >= band.gte;
    const ltOk = band.lt === undefined || value < band.lt;
    if (gteOk && ltOk) {
      return band.status;
    }
  }
  return 'normal';
}

export function singleEntryStatus(
  indicator: CatalogIndicator,
  value: number,
  value2: number | null,
  crew: CrewMember
): Status {
  if (indicator.eval_mode === 'baseline_pct') {
    const pctDelta = ((value - crew.baseline_mass_kg) / crew.baseline_mass_kg) * 100;
    return bandStatus(pctDelta, indicator.bands);
  }
  const s1 = bandStatus(value, indicator.bands);
  if (indicator.bands2 && value2 !== null && value2 !== undefined) {
    const s2 = bandStatus(value2, indicator.bands2);
    return worseConcreteStatus(s1, s2);
  }
  return s1;
}

export interface EvaluatedIndicatorResult {
  status: OverallStatus;
  latest: MeasurementRecord | null;
  evaluatedValue: number | null;
  displayValue: string;
  daysSince: number | null;
  due: boolean;
  trend: TrendDirection;
  sparkline: number[];
}

export function formatNumber(val: number, decimals: number): string {
  return val.toFixed(decimals);
}

export function formatDisplayValue(
  indicator: CatalogIndicator,
  value: number | null,
  value2: number | null
): string {
  if (value === null || value === undefined) {
    return '—';
  }
  const fields = indicator.input.fields;
  const f1 = formatNumber(value, fields[0]?.decimals ?? 0);
  if (fields.length > 1 && value2 !== null && value2 !== undefined) {
    const f2 = formatNumber(value2, fields[1]?.decimals ?? 0);
    return `${f1}/${f2}`;
  }
  return f1;
}

export function computeTrend(values: number[]): TrendDirection {
  if (values.length < 2) {
    return 'none';
  }
  const latest = values[values.length - 1];
  const prevSlice = values.slice(Math.max(0, values.length - 6), values.length - 1);
  if (prevSlice.length === 0) {
    return 'none';
  }
  const prevMean = prevSlice.reduce((sum, v) => sum + v, 0) / prevSlice.length;
  if (prevMean === 0) {
    if (latest === 0) return 'flat';
    return latest > 0 ? 'up' : 'down';
  }
  const relChange = (latest - prevMean) / Math.abs(prevMean);
  if (Math.abs(relChange) <= 0.02) {
    return 'flat';
  }
  return relChange > 0.02 ? 'up' : 'down';
}

export function isIndicatorDue(
  indicator: CatalogIndicator,
  latestMeasuredAt: string | null,
  now: Date
): boolean {
  if (!latestMeasuredAt) {
    return true;
  }
  if (indicator.cadence === 'daily') {
    return utcDayKey(latestMeasuredAt) !== utcDayKey(now);
  }
  return daysBetweenUtc(latestMeasuredAt, now) >= 7;
}

export function evaluateIndicator(
  indicator: CatalogIndicator,
  entries: MeasurementRecord[],
  crew: CrewMember,
  now: Date
): EvaluatedIndicatorResult {
  const sorted = [...entries].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  if (sorted.length === 0) {
    return {
      status: 'no_data',
      latest: null,
      evaluatedValue: null,
      displayValue: '—',
      daysSince: null,
      due: true,
      trend: 'none',
      sparkline: [],
    };
  }

  const latest = sorted[sorted.length - 1];
  const days = Math.max(0, daysBetweenUtc(latest.measured_at, now));
  const due = isIndicatorDue(indicator, latest.measured_at, now);
  const sparkline = sorted.slice(-14).map((e) => e.value);
  const trend = computeTrend(sorted.map((e) => e.value));
  const displayValue = formatDisplayValue(indicator, latest.value, latest.value2);

  if (indicator.eval_mode === 'mean_7d') {
    // Latest entry per UTC day over the last 7 UTC days including today
    const byDay = new Map<string, MeasurementRecord>();
    for (const entry of sorted) {
      const diff = daysBetweenUtc(entry.measured_at, now);
      if (diff >= 0 && diff <= 6) {
        byDay.set(utcDayKey(entry.measured_at), entry);
      }
    }
    if (byDay.size === 0) {
      // Fall back to latest if all data is older than 7 days
      const fallbackStatus = bandStatus(latest.value, indicator.bands);
      return {
        status: fallbackStatus,
        latest,
        evaluatedValue: latest.value,
        displayValue,
        daysSince: days,
        due,
        trend,
        sparkline,
      };
    }
    const vals = Array.from(byDay.values()).map((e) => e.value);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const status = bandStatus(mean, indicator.bands);
    return {
      status,
      latest,
      evaluatedValue: Number(mean.toFixed(2)),
      displayValue,
      daysSince: days,
      due,
      trend,
      sparkline,
    };
  }

  if (indicator.eval_mode === 'baseline_pct') {
    const pctDelta = ((latest.value - crew.baseline_mass_kg) / crew.baseline_mass_kg) * 100;
    const status = bandStatus(pctDelta, indicator.bands);
    return {
      status,
      latest,
      evaluatedValue: Number(pctDelta.toFixed(2)),
      displayValue,
      daysSince: days,
      due,
      trend,
      sparkline,
    };
  }

  // single eval_mode
  const status = singleEntryStatus(indicator, latest.value, latest.value2, crew);
  return {
    status,
    latest,
    evaluatedValue: latest.value,
    displayValue,
    daysSince: days,
    due,
    trend,
    sparkline,
  };
}

export function symptomStatus(symptom: CatalogSymptom, severity: number): Status {
  if (severity <= 0) {
    return 'normal';
  }
  const key = String(severity);
  return symptom.severities[key] ?? 'watch';
}
