import { daysBetweenUtc, utcDayKey } from './clock.ts';
import type {
  BadgeAwardRecord,
  BadgeProgress,
  Catalog,
  CheckinRecord,
  MeasurementRecord,
  ProgressSummary,
  SymptomRecord,
} from '../shared/types.ts';

function computeStreaks(sortedUniqueDays: string[], now: Date): { current: number; best: number } {
  if (sortedUniqueDays.length === 0) {
    return { current: 0, best: 0 };
  }

  let best = 1;
  let run = 1;
  for (let i = 1; i < sortedUniqueDays.length; i++) {
    const diff = daysBetweenUtc(sortedUniqueDays[i - 1], sortedUniqueDays[i]);
    if (diff === 1) {
      run += 1;
      if (run > best) best = run;
    } else if (diff > 1) {
      run = 1;
    }
  }

  // Current streak is alive if the most recent check-in day is today or yesterday (UTC)
  const latestDay = sortedUniqueDays[sortedUniqueDays.length - 1];
  const gapFromNow = daysBetweenUtc(latestDay, now);
  if (gapFromNow > 1) {
    return { current: 0, best };
  }

  let current = 1;
  for (let i = sortedUniqueDays.length - 1; i > 0; i--) {
    const diff = daysBetweenUtc(sortedUniqueDays[i - 1], sortedUniqueDays[i]);
    if (diff === 1) {
      current += 1;
    } else {
      break;
    }
  }
  return { current, best };
}

export function evaluateBadgeEarns(
  crewId: string,
  checkins: CheckinRecord[],
  measurements: MeasurementRecord[],
  symptomReports: SymptomRecord[],
  catalog: Catalog,
  existingAwards: BadgeAwardRecord[]
): BadgeAwardRecord[] {
  const existingMap = new Map(existingAwards.map((a) => [a.badge_id, a]));
  const awards: BadgeAwardRecord[] = [...existingAwards];

  const sortedCheckins = [...checkins].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const sortedMeasurements = [...measurements].sort((a, b) =>
    a.measured_at.localeCompare(b.measured_at)
  );
  const sortedSymptoms = [...symptomReports].sort((a, b) =>
    a.reported_at.localeCompare(b.reported_at)
  );

  const awardIfNew = (badgeId: string, earnedAt: string) => {
    if (!existingMap.has(badgeId)) {
      const rec: BadgeAwardRecord = { crew_id: crewId, badge_id: badgeId, earned_at: earnedAt };
      existingMap.set(badgeId, rec);
      awards.push(rec);
    }
  };

  // 1. first_checkin
  if (sortedCheckins.length > 0) {
    awardIfNew('first_checkin', sortedCheckins[0].created_at);
  }

  // 2-4. streak_3, streak_7, streak_30
  const dayFirstCheckin = new Map<string, string>();
  for (const ck of sortedCheckins) {
    const day = utcDayKey(ck.created_at);
    if (!dayFirstCheckin.has(day)) {
      dayFirstCheckin.set(day, ck.created_at);
    }
  }
  const uniqueDays = Array.from(dayFirstCheckin.keys()).sort();
  let consecutive = 0;
  for (let i = 0; i < uniqueDays.length; i++) {
    if (i === 0) {
      consecutive = 1;
    } else {
      const diff = daysBetweenUtc(uniqueDays[i - 1], uniqueDays[i]);
      consecutive = diff === 1 ? consecutive + 1 : 1;
    }
    const ts = dayFirstCheckin.get(uniqueDays[i])!;
    if (consecutive >= 3) awardIfNew('streak_3', ts);
    if (consecutive >= 7) awardIfNew('streak_7', ts);
    if (consecutive >= 30) awardIfNew('streak_30', ts);
  }

  // 5. full_panel: every indicator measured at least once
  const allIndIds = new Set(catalog.indicators.map((i) => i.id));
  const seenInds = new Set<string>();
  for (const m of sortedMeasurements) {
    seenInds.add(m.indicator_id);
    if (seenInds.size === allIndIds.size) {
      awardIfNew('full_panel', m.measured_at);
      break;
    }
  }

  // 6. weekly_guardian: all weekly indicators measured at least once
  const weeklyIds = new Set(catalog.indicators.filter((i) => i.cadence === 'weekly').map((i) => i.id));
  const seenWeekly = new Set<string>();
  for (const m of sortedMeasurements) {
    if (weeklyIds.has(m.indicator_id)) {
      seenWeekly.add(m.indicator_id);
      if (seenWeekly.size === weeklyIds.size) {
        awardIfNew('weekly_guardian', m.measured_at);
        break;
      }
    }
  }

  // 7. symptom_clear: a severity-0 symptom report recorded after an active symptom
  const activeBefore = new Set<string>();
  for (const sr of sortedSymptoms) {
    if (sr.severity > 0) {
      activeBefore.add(sr.symptom_id);
    } else if (sr.severity === 0 && activeBefore.has(sr.symptom_id)) {
      awardIfNew('symptom_clear', sr.reported_at);
      break;
    }
  }

  return awards;
}

export function computeProgress(
  crewId: string,
  checkins: CheckinRecord[],
  measurements: MeasurementRecord[],
  awards: BadgeAwardRecord[],
  catalog: Catalog,
  now: Date
): ProgressSummary {
  const uniqueDays = Array.from(new Set(checkins.map((c) => utcDayKey(c.created_at)))).sort();
  const streaks = computeStreaks(uniqueDays, now);

  const awardMap = new Map(awards.map((a) => [a.badge_id, a.earned_at]));
  const badges: BadgeProgress[] = catalog.badges.map((b) => ({
    badge_id: b.id,
    name: b.name,
    description: b.description,
    points: b.points,
    earned: awardMap.has(b.id),
    earned_at: awardMap.get(b.id) ?? null,
  }));

  const badgePoints = badges.reduce((sum, b) => sum + (b.earned ? b.points : 0), 0);
  const points = uniqueDays.length * 10 + measurements.length * 2 + badgePoints;

  const sortedLevels = [...catalog.levels].sort((a, b) => a.min_points - b.min_points);
  let currentLevel = sortedLevels[0];
  let nextLevel = sortedLevels[1] ?? null;
  for (let i = 0; i < sortedLevels.length; i++) {
    if (points >= sortedLevels[i].min_points) {
      currentLevel = sortedLevels[i];
      nextLevel = sortedLevels[i + 1] ?? null;
    }
  }

  return {
    crew_id: crewId,
    points,
    level: currentLevel.level,
    level_name: currentLevel.name,
    points_to_next_level: nextLevel ? Math.max(0, nextLevel.min_points - points) : null,
    next_level_points: nextLevel ? nextLevel.min_points : null,
    current_streak: streaks.current,
    best_streak: streaks.best,
    total_checkins: checkins.length,
    checkin_days: uniqueDays.length,
    badges,
  };
}
