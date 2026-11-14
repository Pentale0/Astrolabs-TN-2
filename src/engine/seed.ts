import { addUtcDays, toIsoUtc, utcDayKey } from './clock.ts';
import { singleEntryStatus } from './evaluation.ts';
import { evaluateBadgeEarns } from './progress.ts';
import type {
  BadgeAwardRecord,
  Catalog,
  CheckinRecord,
  CrewMember,
  MeasurementRecord,
  ScenarioDescriptor,
  SymptomRecord,
} from '../shared/types.ts';

function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seedStr: string): () => number {
  let a = hashString(seedStr);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng: () => number, min: number, max: number, decimals = 0): number {
  const raw = min + rng() * (max - min);
  const factor = Math.pow(10, decimals);
  return Math.round(raw * factor) / factor;
}

export const SCENARIOS: ScenarioDescriptor[] = [
  {
    id: 'nominal',
    name: 'Nominal Mission Baseline',
    description: 'Healthy 45-day mission cadence across all indicators with no active symptoms.',
    expected_status: 'normal',
  },
  {
    id: 'sans_risk',
    name: 'SANS / Intracranial Fluid Shift',
    description: 'Elevated intraocular pressure paired with near-vision blur and persistent headache.',
    expected_status: 'alert',
  },
  {
    id: 'cardio_deconditioning',
    name: 'Cardiovascular & Orthostatic Strain',
    description: 'Elevated brachial blood pressure and resting tachycardia.',
    expected_status: 'alert',
  },
  {
    id: 'sleep_circadian',
    name: 'Circadian & Behavioral Drift',
    description: '7-day sleep debt below 5.5 hours paired with declining mood and fatigue.',
    expected_status: 'alert',
  },
  {
    id: 'radiation_immune',
    name: 'Solar Particle Event & Immune Stress',
    description: 'High weekly radiation dose with febrile temperature spike and skin rash.',
    expected_status: 'alert',
  },
  {
    id: 'metabolic_bone',
    name: 'Nutrition & Musculoskeletal Loss',
    description: 'Body mass drop >=5% below baseline with low exercise volume and appetite loss.',
    expected_status: 'alert',
  },
  {
    id: 'eva_hypoxia',
    name: 'EVA Prep & Mild Hypoxia Watch',
    description: 'Borderline SpO2 (93%) with joint ache and vestibular dizziness.',
    expected_status: 'watch',
  },
  {
    id: 'baseline_empty',
    name: 'Pre-Flight / Fresh Crew (No Data)',
    description: 'Empty telemetry log prior to first check-in.',
    expected_status: 'no_data',
  },
];

export const DEFAULT_CREW: CrewMember[] = [
  {
    id: 'c1',
    name: 'Cmdr. Elena Vance',
    role: 'Mission Commander',
    environment: 'station',
    baseline_mass_kg: 64.5,
    mission_start_date: '2026-09-20',
    avatar_color: '#06B6D4',
  },
  {
    id: 'c2',
    name: 'Dr. Marcus Chen',
    role: 'Crew Medical Officer',
    environment: 'mars_base',
    baseline_mass_kg: 76.0,
    mission_start_date: '2026-08-15',
    avatar_color: '#10B981',
  },
  {
    id: 'c3',
    name: 'Amara Okafor',
    role: 'Flight Engineer',
    environment: 'lunar_base',
    baseline_mass_kg: 68.2,
    mission_start_date: '2026-10-01',
    avatar_color: '#F59E0B',
  },
];

export interface SeedCrewData {
  checkins: CheckinRecord[];
  measurements: MeasurementRecord[];
  symptoms: SymptomRecord[];
  badges: BadgeAwardRecord[];
}

export function generateCrewScenarioData(
  crew: CrewMember,
  scenarioId: string,
  catalog: Catalog,
  now: Date,
  idStart = 1
): SeedCrewData {
  if (scenarioId === 'baseline_empty') {
    return { checkins: [], measurements: [], symptoms: [], badges: [] };
  }

  const rng = createRng(`${crew.id}:${scenarioId}`);
  const checkins: CheckinRecord[] = [];
  const measurements: MeasurementRecord[] = [];
  const symptoms: SymptomRecord[] = [];
  let nextMeasurementId = idStart;
  let nextSymptomId = idStart;

  const indMap = new Map(catalog.indicators.map((i) => [i.id, i]));

  const pushMeasurement = (
    checkinId: string,
    indicatorId: string,
    value: number,
    value2: number | null,
    measuredAt: string
  ) => {
    const ind = indMap.get(indicatorId);
    if (!ind) return;
    const status = singleEntryStatus(ind, value, value2, crew);
    measurements.push({
      id: nextMeasurementId++,
      crew_id: crew.id,
      checkin_id: checkinId,
      indicator_id: indicatorId,
      value,
      value2,
      measured_at: measuredAt,
      status,
    });
  };

  // Generate 45 days ending YESTERDAY (daysAgo: 45 down to 1 -> nothing today!)
  for (let daysAgo = 45; daysAgo >= 1; daysAgo--) {
    const dayDate = addUtcDays(now, -daysAgo);
    const dayStr = utcDayKey(dayDate);
    const hour = 8 + Math.floor(rng() * 3);
    const minute = Math.floor(rng() * 60);
    const ts = `${dayStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;
    const ckNum = 46 - daysAgo;
    const ckId = `ck_${crew.id}_${String(ckNum).padStart(2, '0')}`;

    checkins.push({
      id: ckId,
      crew_id: crew.id,
      created_at: ts,
      note: daysAgo === 1 ? `Automated telemetry log (${scenarioId})` : null,
    });

    // Baseline nominal values
    let sys = randRange(rng, 112, 124, 0);
    let dia = randRange(rng, 70, 80, 0);
    let hr = randRange(rng, 58, 72, 0);
    let spo2 = randRange(rng, 97, 99, 0);
    let glucose = randRange(rng, 85, 105, 0);
    let temp = randRange(rng, 36.4, 36.9, 1);
    let sleep = randRange(rng, 7.0, 8.1, 1);
    let mood = randRange(rng, 7, 9, 0);
    let exercise = randRange(rng, 95, 125, 0);

    let mass = Number((crew.baseline_mass_kg + randRange(rng, -0.6, 0.4, 1)).toFixed(1));
    let iop = randRange(rng, 13.5, 16.8, 1);
    let rad = randRange(rng, 1.8, 3.2, 2);

    // Apply scenario trajectories over the most recent 7 days (or yesterday for single-point)
    if (scenarioId === 'sans_risk' && daysAgo <= 7) {
      iop = daysAgo === 1 ? 25.4 : 22.8;
    }
    if (scenarioId === 'cardio_deconditioning' && daysAgo <= 5) {
      sys = daysAgo === 1 ? 148 : randRange(rng, 135, 144, 0);
      dia = daysAgo === 1 ? 94 : randRange(rng, 86, 92, 0);
      hr = daysAgo === 1 ? 114 : randRange(rng, 98, 108, 0);
    }
    if (scenarioId === 'sleep_circadian' && daysAgo <= 7) {
      sleep = randRange(rng, 4.4, 5.2, 1);
      mood = randRange(rng, 3, 4, 0);
    }
    if (scenarioId === 'radiation_immune' && daysAgo <= 7) {
      rad = daysAgo === 1 ? 12.6 : 8.4;
      if (daysAgo === 1) {
        temp = 38.3;
      }
    }
    if (scenarioId === 'metabolic_bone' && daysAgo <= 7) {
      mass = Number((crew.baseline_mass_kg * 0.942).toFixed(1)); // -5.8%
      exercise = randRange(rng, 20, 40, 0);
    }
    if (scenarioId === 'eva_hypoxia' && daysAgo <= 2) {
      spo2 = daysAgo === 1 ? 93 : 94;
    }

    pushMeasurement(ckId, 'blood_pressure', sys, dia, ts);
    pushMeasurement(ckId, 'heart_rate', hr, null, ts);
    pushMeasurement(ckId, 'spo2', spo2, null, ts);
    pushMeasurement(ckId, 'blood_glucose', glucose, null, ts);
    pushMeasurement(ckId, 'body_temp', temp, null, ts);
    pushMeasurement(ckId, 'sleep_hours', sleep, null, ts);
    pushMeasurement(ckId, 'mood_score', mood, null, ts);
    pushMeasurement(ckId, 'exercise_minutes', exercise, null, ts);

    // Weekly items logged every 7 days AND on yesterday (daysAgo === 1) if triggered by scenario
    const isWeeklyDay = (45 - daysAgo) % 7 === 0 || daysAgo === 1;
    if (isWeeklyDay) {
      pushMeasurement(ckId, 'body_mass', mass, null, ts);
      pushMeasurement(ckId, 'intraocular_pressure', iop, null, ts);
      pushMeasurement(ckId, 'radiation_dose', rad, null, ts);
    }

    // Earlier transient symptom that was cleared so symptom_clear badge works in nominal history
    if (daysAgo === 20) {
      symptoms.push({
        id: nextSymptomId++,
        crew_id: crew.id,
        checkin_id: ckId,
        symptom_id: 'fatigue',
        severity: 1,
        reported_at: ts,
      });
    }
    if (daysAgo === 18) {
      symptoms.push({
        id: nextSymptomId++,
        crew_id: crew.id,
        checkin_id: ckId,
        symptom_id: 'fatigue',
        severity: 0,
        reported_at: ts,
      });
    }

    // Active scenario symptoms dated yesterday (daysAgo === 1)
    if (daysAgo === 1) {
      if (scenarioId === 'sans_risk') {
        symptoms.push(
          { id: nextSymptomId++, crew_id: crew.id, checkin_id: ckId, symptom_id: 'visual_blur', severity: 2, reported_at: ts },
          { id: nextSymptomId++, crew_id: crew.id, checkin_id: ckId, symptom_id: 'headache', severity: 2, reported_at: ts }
        );
      } else if (scenarioId === 'sleep_circadian') {
        symptoms.push({
          id: nextSymptomId++,
          crew_id: crew.id,
          checkin_id: ckId,
          symptom_id: 'fatigue',
          severity: 3,
          reported_at: ts,
        });
      } else if (scenarioId === 'radiation_immune') {
        symptoms.push({
          id: nextSymptomId++,
          crew_id: crew.id,
          checkin_id: ckId,
          symptom_id: 'skin_rash',
          severity: 2,
          reported_at: ts,
        });
      } else if (scenarioId === 'metabolic_bone') {
        symptoms.push({
          id: nextSymptomId++,
          crew_id: crew.id,
          checkin_id: ckId,
          symptom_id: 'appetite_loss',
          severity: 2,
          reported_at: ts,
        });
      } else if (scenarioId === 'eva_hypoxia') {
        symptoms.push(
          { id: nextSymptomId++, crew_id: crew.id, checkin_id: ckId, symptom_id: 'joint_pain', severity: 1, reported_at: ts },
          { id: nextSymptomId++, crew_id: crew.id, checkin_id: ckId, symptom_id: 'dizziness', severity: 1, reported_at: ts }
        );
      }
    }
  }

  const badges = evaluateBadgeEarns(crew.id, checkins, measurements, symptoms, catalog, []);
  return { checkins, measurements, symptoms, badges };
}

export function defaultScenarioForCrew(crewId: string): string {
  if (crewId === 'c1') return 'nominal';
  if (crewId === 'c2') return 'sans_risk';
  if (crewId === 'c3') return 'sleep_circadian';
  return 'nominal';
}
