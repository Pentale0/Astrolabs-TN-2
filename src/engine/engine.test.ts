import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from './catalog.ts';
import {
  bandStatus,
  computeTrend,
  evaluateIndicator,
  formatDisplayValue,
  isIndicatorDue,
  singleEntryStatus,
  symptomStatus,
} from './evaluation.ts';
import { buildSummary } from './insights.ts';
import { computeProgress, evaluateBadgeEarns } from './progress.ts';
import { formatMedicalReport } from './report.ts';
import { DEFAULT_CREW, generateCrewScenarioData, SCENARIOS } from './seed.ts';
import type { CrewMember, MeasurementRecord, SymptomRecord } from '../shared/types.ts';

const catalog = loadCatalog();
const fixedNow = new Date('2026-11-14T12:00:00Z');
const crewBase: CrewMember = DEFAULT_CREW[0];

test('bandStatus evaluates gte inclusive and lt exclusive with first match wins', () => {
  const hr = catalog.indicators.find((i) => i.id === 'heart_rate')!;
  assert.equal(bandStatus(44.9, hr.bands), 'alert');
  assert.equal(bandStatus(45, hr.bands), 'watch');
  assert.equal(bandStatus(51.9, hr.bands), 'watch');
  assert.equal(bandStatus(52, hr.bands), 'normal');
  assert.equal(bandStatus(94.9, hr.bands), 'normal');
  assert.equal(bandStatus(95, hr.bands), 'watch');
  assert.equal(bandStatus(109.9, hr.bands), 'watch');
  assert.equal(bandStatus(110, hr.bands), 'alert');
});

test('blood_pressure takes worse status across systolic and diastolic bands', () => {
  const bp = catalog.indicators.find((i) => i.id === 'blood_pressure')!;
  assert.equal(singleEntryStatus(bp, 118, 76, crewBase), 'normal');
  assert.equal(singleEntryStatus(bp, 118, 87, crewBase), 'watch');
  assert.equal(singleEntryStatus(bp, 132, 92, crewBase), 'alert');
  assert.equal(singleEntryStatus(bp, 142, 74, crewBase), 'alert');
  assert.equal(formatDisplayValue(bp, 118, 76), '118/76');
});

test('baseline_pct evaluates ±3% and ±5% thresholds around crew baseline_mass_kg', () => {
  const massInd = catalog.indicators.find((i) => i.id === 'body_mass')!;
  const crew100: CrewMember = { ...crewBase, baseline_mass_kg: 100 };
  assert.equal(singleEntryStatus(massInd, 97.1, null, crew100), 'normal'); // -2.9%
  assert.equal(singleEntryStatus(massInd, 97.0, null, crew100), 'normal'); // -3.0% is in [-3, 3)
  assert.equal(singleEntryStatus(massInd, 96.99, null, crew100), 'watch'); // -3.01% is in [-5, -3)
  assert.equal(singleEntryStatus(massInd, 95.0, null, crew100), 'watch'); // -5.0% is in [-5, -3)
  assert.equal(singleEntryStatus(massInd, 94.99, null, crew100), 'alert'); // -5.01% < -5
  assert.equal(singleEntryStatus(massInd, 102.99, null, crew100), 'normal'); // +2.99% in [-3, 3)
  assert.equal(singleEntryStatus(massInd, 103.0, null, crew100), 'watch'); // +3.0% in [3, 5)
  assert.equal(singleEntryStatus(massInd, 105.0, null, crew100), 'alert'); // +5.0% >= 5
});

test('mean_7d uses latest entry per UTC day over last 7 days including today', () => {
  const sleepInd = catalog.indicators.find((i) => i.id === 'sleep_hours')!;
  const entries: MeasurementRecord[] = [
    // Older than 7 days -> excluded from mean_7d
    { id: 1, crew_id: 'c1', checkin_id: 'k1', indicator_id: 'sleep_hours', value: 2.0, value2: null, measured_at: '2026-11-01T08:00:00Z', status: 'alert' },
    // Same UTC day: earlier 4.0 replaced by later 8.0
    { id: 2, crew_id: 'c1', checkin_id: 'k2', indicator_id: 'sleep_hours', value: 4.0, value2: null, measured_at: '2026-11-12T08:00:00Z', status: 'alert' },
    { id: 3, crew_id: 'c1', checkin_id: 'k3', indicator_id: 'sleep_hours', value: 8.0, value2: null, measured_at: '2026-11-12T20:00:00Z', status: 'normal' },
    // Yesterday 7.0
    { id: 4, crew_id: 'c1', checkin_id: 'k4', indicator_id: 'sleep_hours', value: 7.0, value2: null, measured_at: '2026-11-13T09:00:00Z', status: 'normal' },
  ];
  const res = evaluateIndicator(sleepInd, entries, crewBase, fixedNow);
  assert.equal(res.evaluatedValue, 7.5);
  assert.equal(res.status, 'normal');
  assert.equal(res.daysSince, 1);
  assert.equal(res.due, true); // daily not measured today (2026-11-14)
});

test('due logic handles daily and weekly cadences properly', () => {
  const daily = catalog.indicators.find((i) => i.id === 'heart_rate')!;
  const weekly = catalog.indicators.find((i) => i.id === 'radiation_dose')!;
  assert.equal(isIndicatorDue(daily, '2026-11-14T01:00:00Z', fixedNow), false);
  assert.equal(isIndicatorDue(daily, '2026-11-13T23:59:00Z', fixedNow), true);
  assert.equal(isIndicatorDue(weekly, '2026-11-08T12:00:00Z', fixedNow), false); // 6 days
  assert.equal(isIndicatorDue(weekly, '2026-11-07T12:00:00Z', fixedNow), true); // 7 days
});

test('computeTrend detects up, down, flat within 2%, and none', () => {
  assert.equal(computeTrend([70]), 'none');
  assert.equal(computeTrend([70, 71]), 'flat'); // +1.4%
  assert.equal(computeTrend([70, 75]), 'up'); // +7.1%
  assert.equal(computeTrend([70, 65]), 'down'); // -7.1%
});

test('symptomStatus maps severity 0..3 using catalog', () => {
  const blur = catalog.symptoms.find((s) => s.id === 'visual_blur')!;
  const fatigue = catalog.symptoms.find((s) => s.id === 'fatigue')!;
  assert.equal(symptomStatus(blur, 0), 'normal');
  assert.equal(symptomStatus(blur, 1), 'watch');
  assert.equal(symptomStatus(blur, 2), 'alert');
  assert.equal(symptomStatus(fatigue, 1), 'normal');
  assert.equal(symptomStatus(fatigue, 2), 'watch');
  assert.equal(symptomStatus(fatigue, 3), 'alert');
});

test('insights suppress generic alerts when specific cluster rule covers them and reflect environment escalation', () => {
  const iop = 25.0;
  const measurements: MeasurementRecord[] = [
    { id: 1, crew_id: 'c1', checkin_id: 'k1', indicator_id: 'intraocular_pressure', value: iop, value2: null, measured_at: '2026-11-13T09:00:00Z', status: 'alert' },
  ];
  const symptoms: SymptomRecord[] = [
    { id: 1, crew_id: 'c1', checkin_id: 'k1', symptom_id: 'visual_blur', severity: 2, reported_at: '2026-11-13T09:00:00Z' },
  ];

  const stationSummary = buildSummary({ ...crewBase, environment: 'station' }, measurements, symptoms, catalog, fixedNow);
  assert.equal(stationSummary.overall_status, 'alert');
  assert.ok(stationSummary.insights.some((i) => i.id === 'sans_neuro_cluster'));
  assert.ok(!stationSummary.insights.some((i) => i.id === 'ind_intraocular_pressure'));
  assert.ok(!stationSummary.insights.some((i) => i.id === 'sym_visual_blur'));
  assert.equal(stationSummary.escalation.autonomous_protocol, false);
  assert.equal(stationSummary.escalation.level, 'flight_surgeon');

  const marsSummary = buildSummary({ ...crewBase, environment: 'mars_base' }, measurements, symptoms, catalog, fixedNow);
  assert.equal(marsSummary.escalation.autonomous_protocol, true);
  assert.equal(marsSummary.escalation.level, 'crew');
  assert.match(marsSummary.escalation.note, /48 min round-trip/);
});

test('all 8 demo scenarios generate valid data ending yesterday and produce expected statuses', () => {
  for (const sc of SCENARIOS) {
    const data = generateCrewScenarioData(crewBase, sc.id, catalog, fixedNow);
    // Ensure nothing is logged today
    for (const ck of data.checkins) {
      assert.notEqual(ck.created_at.slice(0, 10), '2026-11-14');
    }
    const summary = buildSummary(crewBase, data.measurements, data.symptoms, catalog, fixedNow);
    assert.equal(summary.overall_status, sc.expected_status, `Scenario ${sc.id} mismatch`);
    assert.equal(summary.regions.length, 6);

    const progress = computeProgress(crewBase.id, data.checkins, data.measurements, data.badges, catalog, fixedNow);
    if (sc.id !== 'baseline_empty') {
      assert.equal(progress.current_streak, 45);
      assert.equal(progress.badges.filter((b) => b.earned).length, 7);
    } else {
      assert.equal(progress.current_streak, 0);
      assert.equal(progress.points, 0);
    }

    const reportText = formatMedicalReport(summary, progress);
    for (const line of reportText.split('\n')) {
      assert.ok(line.length <= 90, `Report line too long (${line.length}): ${line}`);
    }
  }
});

test('evaluateBadgeEarns unlocks badges chronologically on first qualifying event', () => {
  const awards = evaluateBadgeEarns(
    'c1',
    [{ id: 'ck1', crew_id: 'c1', created_at: '2026-11-13T10:00:00Z', note: null }],
    [],
    [],
    catalog,
    []
  );
  assert.equal(awards.length, 1);
  assert.equal(awards[0].badge_id, 'first_checkin');
});
