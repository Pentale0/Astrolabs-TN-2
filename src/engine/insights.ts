import { evaluateIndicator, symptomStatus, worseStatus } from './evaluation.ts';
import type {
  ActiveSymptomSummary,
  Catalog,
  CatalogEnvironment,
  CrewMember,
  EscalationInfo,
  IndicatorSummary,
  Insight,
  MeasurementRecord,
  OverallStatus,
  RegionSummary,
  Status,
  Summary,
  SymptomRecord,
} from '../shared/types.ts';
import { toIsoUtc } from './clock.ts';

const INSIGHT_SEVERITY_RANK: Record<Insight['severity'], number> = {
  alert: 3,
  watch: 2,
  info: 1,
  normal: 0,
};

function dedupActions(actions: string[], limit = 3): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const a of actions) {
    if (!seen.has(a)) {
      seen.add(a);
      result.push(a);
      if (result.length >= limit) break;
    }
  }
  return result;
}

export function buildSummary(
  crew: CrewMember,
  measurements: MeasurementRecord[],
  symptomReports: SymptomRecord[],
  catalog: Catalog,
  now: Date
): Summary {
  const environment: CatalogEnvironment =
    catalog.environments.find((e) => e.id === crew.environment) ?? catalog.environments[0];

  // Group measurements by indicator
  const measurementsByInd = new Map<string, MeasurementRecord[]>();
  for (const m of measurements) {
    const arr = measurementsByInd.get(m.indicator_id) ?? [];
    arr.push(m);
    measurementsByInd.set(m.indicator_id, arr);
  }

  // Evaluate all indicators
  const indicatorSummaries = new Map<string, IndicatorSummary>();
  for (const ind of catalog.indicators) {
    const entries = measurementsByInd.get(ind.id) ?? [];
    const evalRes = evaluateIndicator(ind, entries, crew, now);
    const status = evalRes.status;
    const message =
      status === 'no_data'
        ? `No ${ind.name.toLowerCase()} readings logged yet.`
        : ind.messages[status];
    const actions =
      status === 'watch' || status === 'alert' ? (ind.actions[status] ?? []) : [];

    indicatorSummaries.set(ind.id, {
      indicator_id: ind.id,
      name: ind.name,
      region_id: ind.region_id,
      cadence: ind.cadence,
      eval_mode: ind.eval_mode,
      unit: ind.unit,
      status,
      latest_value: evalRes.latest?.value ?? null,
      latest_value2: evalRes.latest?.value2 ?? null,
      evaluated_value: evalRes.evaluatedValue,
      display_value: evalRes.displayValue,
      measured_at: evalRes.latest?.measured_at ?? null,
      days_since: evalRes.daysSince,
      due: evalRes.due,
      trend: evalRes.trend,
      sparkline: evalRes.sparkline,
      message,
      actions,
    });
  }

  // Latest state per symptom
  const latestSymptomMap = new Map<string, SymptomRecord>();
  const sortedSymptoms = [...symptomReports].sort((a, b) =>
    a.reported_at.localeCompare(b.reported_at)
  );
  for (const sr of sortedSymptoms) {
    latestSymptomMap.set(sr.symptom_id, sr);
  }

  const activeSymptoms: ActiveSymptomSummary[] = [];
  const activeSymptomById = new Map<string, ActiveSymptomSummary>();
  for (const sym of catalog.symptoms) {
    const latest = latestSymptomMap.get(sym.id);
    if (latest && latest.severity > 0) {
      const st = symptomStatus(sym, latest.severity);
      const item: ActiveSymptomSummary = {
        symptom_id: sym.id,
        name: sym.name,
        region_id: sym.region_id,
        severity: latest.severity,
        status: st,
        reported_at: latest.reported_at,
      };
      activeSymptoms.push(item);
      activeSymptomById.set(sym.id, item);
    }
  }

  // Build specific multi-factor spaceflight hazard insights
  const rawInsights: Insight[] = [];
  const coveredIndicators = new Set<string>();
  const coveredSymptoms = new Set<string>();

  const getInd = (id: string) => indicatorSummaries.get(id);
  const isAbnormal = (s: OverallStatus | undefined) => s === 'watch' || s === 'alert';

  // Rule 1: SANS / Intracranial Fluid Shift
  const iop = getInd('intraocular_pressure');
  const blur = activeSymptomById.get('visual_blur');
  const headache = activeSymptomById.get('headache');
  if (isAbnormal(iop?.status) && (blur || headache)) {
    const sev: Status =
      iop?.status === 'alert' || blur?.status === 'alert' || headache?.status === 'alert'
        ? 'alert'
        : 'watch';
    const indIds = ['intraocular_pressure'];
    const symIds = [blur?.symptom_id, headache?.symptom_id].filter((x): x is string => Boolean(x));
    indIds.forEach((id) => coveredIndicators.add(id));
    symIds.forEach((id) => coveredSymptoms.add(id));
    rawInsights.push({
      id: 'sans_neuro_cluster',
      severity: sev,
      title: 'Spaceflight Neuro-ocular Syndrome (SANS) Risk',
      message: `Elevated intraocular pressure (${iop?.display_value} mmHg) paired with neuro-ocular symptoms indicates cephalad fluid shift.`,
      region_id: 'neuro_ocular',
      indicator_ids: indIds,
      symptom_ids: symIds,
      actions: [
        'Run OCT/fundoscope ocular imaging scan immediately',
        'Verify B-complex vitamin supplement and lower-body negative pressure / thigh cuff protocol',
      ],
    });
  }

  // Rule 2: Cardiovascular & Orthostatic Strain / EVA Hypoxia
  const bp = getInd('blood_pressure');
  const hr = getInd('heart_rate');
  const spo2 = getInd('spo2');
  const dizziness = activeSymptomById.get('dizziness');
  if (
    (isAbnormal(bp?.status) && isAbnormal(hr?.status)) ||
    (isAbnormal(spo2?.status) && Boolean(dizziness))
  ) {
    const sev: Status =
      bp?.status === 'alert' ||
      hr?.status === 'alert' ||
      spo2?.status === 'alert' ||
      dizziness?.status === 'alert'
        ? 'alert'
        : 'watch';
    const indIds = [bp, hr, spo2]
      .filter((x): x is IndicatorSummary => Boolean(x && isAbnormal(x.status)))
      .map((x) => x.indicator_id);
    const symIds = dizziness ? ['dizziness'] : [];
    indIds.forEach((id) => coveredIndicators.add(id));
    symIds.forEach((id) => coveredSymptoms.add(id));
    rawInsights.push({
      id: 'cardio_orthostatic',
      severity: sev,
      title: 'Cardiovascular & Oxygenation Strain',
      message: isAbnormal(spo2?.status)
        ? `Reduced SpO2 (${spo2?.display_value}%) with vestibular symptoms warrants immediate cabin ppO2 and vascular check.`
        : `Concurrent blood pressure (${bp?.display_value} mmHg) and heart rate (${hr?.display_value} bpm) deviations indicate cardiovascular adaptation strain.`,
      region_id: 'cardiovascular',
      indicator_ids: indIds,
      symptom_ids: symIds,
      actions: [
        'Pause strenuous tasks, hydrate with electrolytes, and repeat seated vitals in 15 min',
        'Verify cabin O2/CO2 partial pressures and record portable ECG if symptoms persist',
      ],
    });
  }

  // Rule 3: Radiation & Altered Immune Response
  const rad = getInd('radiation_dose');
  const temp = getInd('body_temp');
  const rash = activeSymptomById.get('skin_rash');
  if (isAbnormal(rad?.status) && (isAbnormal(temp?.status) || Boolean(rash))) {
    const sev: Status =
      rad?.status === 'alert' || temp?.status === 'alert' || rash?.status === 'alert'
        ? 'alert'
        : 'watch';
    const indIds = [rad, temp]
      .filter((x): x is IndicatorSummary => Boolean(x && isAbnormal(x.status)))
      .map((x) => x.indicator_id);
    const symIds = rash ? ['skin_rash'] : [];
    indIds.forEach((id) => coveredIndicators.add(id));
    symIds.forEach((id) => coveredSymptoms.add(id));
    rawInsights.push({
      id: 'immune_radiation_cluster',
      severity: sev,
      title: 'Radiation Exposure & Immune Stress',
      message: `Elevated radiation dose (${rad?.display_value} mSv/wk) alongside immune/thermal markers indicates heightened biological stress.`,
      region_id: 'immune_radiation',
      indicator_ids: indIds,
      symptom_ids: symIds,
      actions: [
        'Relocate to shielded storm-shelter habitat volume during solar particle activity',
        'Collect saliva immune biomarker swab and monitor temperature every 4 hours',
      ],
    });
  }

  // Rule 4: Nutrition & Musculoskeletal Deconditioning
  const mass = getInd('body_mass');
  const ex = getInd('exercise_minutes');
  const appetite = activeSymptomById.get('appetite_loss');
  if (isAbnormal(mass?.status) && (isAbnormal(ex?.status) || Boolean(appetite))) {
    const sev: Status =
      mass?.status === 'alert' || ex?.status === 'alert' || appetite?.status === 'alert'
        ? 'alert'
        : 'watch';
    const indIds = [mass, ex]
      .filter((x): x is IndicatorSummary => Boolean(x && isAbnormal(x.status)))
      .map((x) => x.indicator_id);
    const symIds = appetite ? ['appetite_loss'] : [];
    indIds.forEach((id) => coveredIndicators.add(id));
    symIds.forEach((id) => coveredSymptoms.add(id));
    rawInsights.push({
      id: 'metabolic_musculoskeletal',
      severity: sev,
      title: 'Caloric Deficit & Musculoskeletal Loss Risk',
      message: `Body mass shift (${mass?.evaluated_value ?? 0}% vs baseline) combined with reduced loading/appetite risks bone and muscle loss.`,
      region_id: 'metabolic',
      indicator_ids: indIds,
      symptom_ids: symIds,
      actions: [
        'Increase daily protein and caloric intake with high-acceptability ration packs',
        'Protect full 90-minute resistive (ARED) + aerobic countermeasure blocks',
      ],
    });
  }

  // Rule 5: Circadian & Behavioral Isolation Drift
  const sleep = getInd('sleep_hours');
  const mood = getInd('mood_score');
  const fatigue = activeSymptomById.get('fatigue');
  if (isAbnormal(sleep?.status) && (isAbnormal(mood?.status) || Boolean(fatigue))) {
    const sev: Status =
      sleep?.status === 'alert' || mood?.status === 'alert' || fatigue?.status === 'alert'
        ? 'alert'
        : 'watch';
    const indIds = [sleep, mood]
      .filter((x): x is IndicatorSummary => Boolean(x && isAbnormal(x.status)))
      .map((x) => x.indicator_id);
    const symIds = fatigue ? ['fatigue'] : [];
    indIds.forEach((id) => coveredIndicators.add(id));
    symIds.forEach((id) => coveredSymptoms.add(id));
    rawInsights.push({
      id: 'circadian_behavioral_cluster',
      severity: sev,
      title: 'Circadian Disruption & Behavioral Strain',
      message: `7-day sleep average (${sleep?.evaluated_value ?? sleep?.display_value} hrs) with mood/fatigue changes shows isolation and schedule strain.`,
      region_id: 'behavioral_sleep',
      indicator_ids: indIds,
      symptom_ids: symIds,
      actions: [
        'Enforce circadian lighting schedule and 90-min pre-sleep screen/blue-light cutoff',
        'Schedule private ground family link and redistribute high-cognitive-load tasks',
      ],
    });
  }

  // Rule 6: EVA Decompression Risk
  const jointPain = activeSymptomById.get('joint_pain');
  if (jointPain && (dizziness || isAbnormal(spo2?.status))) {
    const sev: Status =
      jointPain.status === 'alert' || dizziness?.status === 'alert' || spo2?.status === 'alert'
        ? 'alert'
        : 'watch';
    const indIds = spo2 && isAbnormal(spo2.status) ? ['spo2'] : [];
    const symIds = ['joint_pain', ...(dizziness ? ['dizziness'] : [])];
    indIds.forEach((id) => coveredIndicators.add(id));
    symIds.forEach((id) => coveredSymptoms.add(id));
    rawInsights.push({
      id: 'eva_decompression_risk',
      severity: sev,
      title: 'Post-EVA Decompression Assessment Required',
      message: 'Joint ache paired with vestibular or oxygenation signs requires immediate decompression screening.',
      region_id: 'musculoskeletal',
      indicator_ids: indIds,
      symptom_ids: symIds,
      actions: [
        'Suspend suit operations and initiate 100% oxygen pre-breathe / hyperbaric check',
        'Evaluate joint range of motion and neurological status every 30 minutes',
      ],
    });
  }

  // Generic indicator insights (suppressed if already covered by specific rules)
  for (const indSummary of indicatorSummaries.values()) {
    if (
      (indSummary.status === 'watch' || indSummary.status === 'alert') &&
      !coveredIndicators.has(indSummary.indicator_id)
    ) {
      rawInsights.push({
        id: `ind_${indSummary.indicator_id}`,
        severity: indSummary.status,
        title: `${indSummary.name} ${indSummary.status === 'alert' ? 'Alert' : 'Watch'}`,
        message: indSummary.message,
        region_id: indSummary.region_id,
        indicator_ids: [indSummary.indicator_id],
        symptom_ids: [],
        actions: indSummary.actions,
      });
    }
  }

  // Generic symptom insights (suppressed if already covered by specific rules)
  for (const sym of activeSymptoms) {
    if ((sym.status === 'watch' || sym.status === 'alert') && !coveredSymptoms.has(sym.symptom_id)) {
      const catSym = catalog.symptoms.find((s) => s.id === sym.symptom_id);
      rawInsights.push({
        id: `sym_${sym.symptom_id}`,
        severity: sym.status,
        title: `${sym.name} Reported`,
        message: `Crew logged severity ${sym.severity}/3: ${catSym?.description ?? sym.name}.`,
        region_id: sym.region_id,
        indicator_ids: [],
        symptom_ids: [sym.symptom_id],
        actions: [
          `Monitor ${sym.name.toLowerCase()} progression over next 12 hours`,
          'Log follow-up symptom severity at next check-in or clear once resolved',
        ],
      });
    }
  }

  // Sort alert -> watch -> info, cap at 5
  rawInsights.sort((a, b) => INSIGHT_SEVERITY_RANK[b.severity] - INSIGHT_SEVERITY_RANK[a.severity]);

  const anyMeasured = Array.from(indicatorSummaries.values()).some(
    (i) => i.status !== 'no_data'
  ) || activeSymptoms.length > 0;

  let insights = rawInsights.slice(0, 5);
  if (anyMeasured && insights.length === 0) {
    insights = [
      {
        id: 'all_good',
        severity: 'info',
        title: 'All Systems Nominal',
        message: 'All measured biomarkers and symptom checks are within healthy mission ranges.',
        region_id: null,
        indicator_ids: [],
        symptom_ids: [],
        actions: ['Maintain scheduled resistive exercise and daily telemetry check-ins'],
      },
    ];
  }

  // Build 6 region summaries
  const regions: RegionSummary[] = catalog.regions.map((reg) => {
    const regIndicators = Array.from(indicatorSummaries.values()).filter(
      (i) => i.region_id === reg.id
    );
    const regSymptoms = activeSymptoms.filter((s) => s.region_id === reg.id);

    let regStatus: OverallStatus = 'no_data';
    for (const ind of regIndicators) {
      regStatus = worseStatus(regStatus, ind.status);
    }
    for (const sym of regSymptoms) {
      regStatus = worseStatus(regStatus, sym.status);
    }

    const regInsights = rawInsights
      .filter((ins) => ins.region_id === reg.id)
      .sort((a, b) => INSIGHT_SEVERITY_RANK[b.severity] - INSIGHT_SEVERITY_RANK[a.severity]);

    let headline = 'No data yet. Measure to see status.';
    if (regStatus === 'normal') {
      headline = 'Looking good.';
    } else if (regStatus === 'watch' || regStatus === 'alert') {
      headline =
        regInsights[0]?.message ??
        regIndicators.find((i) => i.status === regStatus)?.message ??
        'Attention recommended for this system.';
    }

    // Up to 3 actions, alerts first, deduplicated
    const alertActions: string[] = [];
    const watchActions: string[] = [];
    for (const ins of regInsights) {
      if (ins.severity === 'alert') alertActions.push(...ins.actions);
      else if (ins.severity === 'watch') watchActions.push(...ins.actions);
    }
    for (const ind of regIndicators) {
      if (ind.status === 'alert') alertActions.push(...ind.actions);
      else if (ind.status === 'watch') watchActions.push(...ind.actions);
    }
    const actions = dedupActions([...alertActions, ...watchActions], 3);

    return {
      region_id: reg.id,
      name: reg.name,
      subtitle: reg.subtitle,
      hazard: reg.hazard,
      status: regStatus,
      headline,
      indicators: regIndicators,
      active_symptoms: regSymptoms,
      actions,
    };
  });

  // Overall status
  let overallStatus: OverallStatus = 'no_data';
  for (const r of regions) {
    overallStatus = worseStatus(overallStatus, r.status);
  }

  let headline = "Let's get your baseline";
  let subline = 'Complete your first check-in to see your status.';
  if (overallStatus === 'normal') {
    headline = 'All systems nominal';
    subline = "Everything you've measured is in a healthy range.";
  } else if (overallStatus === 'watch') {
    const watchCount = regions.filter((r) => r.status === 'watch').length;
    headline = 'Keep an eye on a few things';
    subline =
      watchCount === 1
        ? '1 area needs attention. Nothing urgent.'
        : `${watchCount} areas need attention. Nothing urgent.`;
  } else if (overallStatus === 'alert') {
    const topAlert = insights.find((i) => i.severity === 'alert');
    headline = 'Action needed';
    subline = topAlert ? `${topAlert.title}. See what to do.` : 'Urgent threshold exceeded. Review countermeasures.';
  }

  const dueCount = Array.from(indicatorSummaries.values()).filter((i) => i.due).length;

  const escalationRequired = overallStatus === 'alert' || overallStatus === 'watch';
  const escalationLevel: EscalationInfo['level'] =
    overallStatus === 'alert'
      ? environment.autonomous_escalation
        ? 'crew'
        : 'flight_surgeon'
      : overallStatus === 'watch'
        ? 'crew'
        : 'none';

  const escalation: EscalationInfo = {
    required: escalationRequired,
    level: escalationLevel,
    comm_delay_label: environment.comm_delay_label,
    autonomous_protocol: environment.autonomous_escalation,
    note: environment.escalation_note,
  };

  return {
    crew,
    environment,
    generated_at: toIsoUtc(now),
    overall_status: overallStatus,
    headline,
    subline,
    due_count: dueCount,
    escalation,
    regions,
    insights,
  };
}
