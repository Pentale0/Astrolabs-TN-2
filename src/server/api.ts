import crypto from 'node:crypto';
import express from 'express';
import { loadCatalog } from '../engine/catalog.ts';
import { addUtcDays, systemClock, toIsoUtc, utcDayKey, type Clock } from '../engine/clock.ts';
import { evaluateIndicator, formatDisplayValue } from '../engine/evaluation.ts';
import { buildSummary } from '../engine/insights.ts';
import { computeProgress, evaluateBadgeEarns } from '../engine/progress.ts';
import { formatMedicalReport } from '../engine/report.ts';
import { SCENARIOS } from '../engine/seed.ts';
import type {
  CheckinEntryResult,
  CheckinPayload,
  CheckinResult,
  HistoryResponse,
  MeasurementRecord,
  Status,
  SymptomRecord,
} from '../shared/types.ts';
import type { VigilDatabase } from './db.ts';
import { ApiError } from './errors.ts';

function shortCheckinId(): string {
  return `ck_${crypto.randomBytes(3).toString('hex')}`;
}

export function createApiRouter(db: VigilDatabase, clock: Clock = systemClock): express.Router {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    const catalog = loadCatalog();
    res.json({
      ok: true,
      status: 'ok',
      catalog_version: catalog.version,
      time: toIsoUtc(clock.now()),
    });
  });

  router.get('/catalog', (_req, res) => {
    const catalog = loadCatalog();
    res.json(catalog);
  });

  router.get('/crew', (_req, res) => {
    res.json(db.listCrew());
  });

  router.get('/crew/:crewId', (req, res, next) => {
    try {
      const crew = db.getCrew(req.params.crewId);
      if (!crew) {
        throw new ApiError('not_found', `Crew member '${req.params.crewId}' not found`);
      }
      res.json(crew);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/crew/:crewId', (req, res, next) => {
    try {
      const crew = db.getCrew(req.params.crewId);
      if (!crew) {
        throw new ApiError('not_found', `Crew member '${req.params.crewId}' not found`);
      }
      const catalog = loadCatalog();
      const body = req.body ?? {};
      const patch: Partial<typeof crew> = {};

      if (body.environment !== undefined) {
        const validEnv = catalog.environments.some((e) => e.id === body.environment);
        if (!validEnv) {
          throw new ApiError(
            'validation_error',
            `Invalid environment '${String(body.environment)}'`,
            'environment'
          );
        }
        patch.environment = body.environment;
      }

      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || body.name.trim().length === 0) {
          throw new ApiError('validation_error', 'Name must be a non-empty string', 'name');
        }
        patch.name = body.name.trim();
      }

      if (body.role !== undefined) {
        if (typeof body.role !== 'string' || body.role.trim().length === 0) {
          throw new ApiError('validation_error', 'Role must be a non-empty string', 'role');
        }
        patch.role = body.role.trim();
      }

      if (body.baseline_mass_kg !== undefined) {
        const mass = Number(body.baseline_mass_kg);
        if (!Number.isFinite(mass) || mass < 40 || mass > 140) {
          throw new ApiError(
            'validation_error',
            'Baseline mass must be between 40 and 140 kg',
            'baseline_mass_kg'
          );
        }
        patch.baseline_mass_kg = mass;
      }

      const updated = db.updateCrew(crew.id, patch);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.get('/crew/:crewId/summary', (req, res, next) => {
    try {
      const crew = db.getCrew(req.params.crewId);
      if (!crew) {
        throw new ApiError('not_found', `Crew member '${req.params.crewId}' not found`);
      }
      const catalog = loadCatalog();
      const data = db.getCrewData(crew.id);
      const summary = buildSummary(crew, data.measurements, data.symptoms, catalog, clock.now());
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  router.post('/crew/:crewId/checkins', (req, res, next) => {
    try {
      const crew = db.getCrew(req.params.crewId);
      if (!crew) {
        throw new ApiError('not_found', `Crew member '${req.params.crewId}' not found`);
      }
      const catalog = loadCatalog();
      const body = (req.body ?? {}) as CheckinPayload;
      const entries = Array.isArray(body.entries) ? body.entries : [];
      const symptomsInput = Array.isArray(body.symptoms) ? body.symptoms : [];
      const symptomsReviewed = Boolean(body.symptoms_reviewed);
      const note =
        typeof body.note === 'string' && body.note.trim().length > 0
          ? body.note.trim().slice(0, 500)
          : null;

      if (entries.length === 0 && symptomsInput.length === 0 && !symptomsReviewed) {
        throw new ApiError(
          'validation_error',
          'Check-in must include at least one indicator entry or symptom update',
          'entries'
        );
      }

      const indMap = new Map(catalog.indicators.map((i) => [i.id, i]));
      const symMap = new Map(catalog.symptoms.map((s) => [s.id, s]));

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry || typeof entry.indicator_id !== 'string' || !indMap.has(entry.indicator_id)) {
          throw new ApiError(
            'validation_error',
            `Unknown indicator_id '${String(entry?.indicator_id)}'`,
            `entries[${i}].indicator_id`
          );
        }
        const ind = indMap.get(entry.indicator_id)!;
        const f1 = ind.input.fields[0];
        const val = Number(entry.value);
        if (entry.value === null || entry.value === undefined || !Number.isFinite(val)) {
          throw new ApiError(
            'validation_error',
            `${ind.name} value must be a valid number`,
            `entries[${i}].value`
          );
        }
        if (val < f1.min || val > f1.max) {
          throw new ApiError(
            'validation_error',
            `${f1.label} must be between ${f1.min} and ${f1.max} ${f1.unit}`,
            `entries[${i}].value`
          );
        }

        if (ind.input.fields.length === 2) {
          const f2 = ind.input.fields[1];
          const val2 = Number(entry.value2);
          if (entry.value2 === null || entry.value2 === undefined || !Number.isFinite(val2)) {
            throw new ApiError(
              'validation_error',
              `${f2.label} is required for ${ind.name}`,
              `entries[${i}].value2`
            );
          }
          if (val2 < f2.min || val2 > f2.max) {
            throw new ApiError(
              'validation_error',
              `${f2.label} must be between ${f2.min} and ${f2.max} ${f2.unit}`,
              `entries[${i}].value2`
            );
          }
        } else if (entry.value2 !== undefined && entry.value2 !== null) {
          throw new ApiError(
            'validation_error',
            `value2 is not supported for ${ind.name}`,
            `entries[${i}].value2`
          );
        }
      }

      for (let i = 0; i < symptomsInput.length; i++) {
        const s = symptomsInput[i];
        if (!s || typeof s.symptom_id !== 'string' || !symMap.has(s.symptom_id)) {
          throw new ApiError(
            'validation_error',
            `Unknown symptom_id '${String(s?.symptom_id)}'`,
            `symptoms[${i}].symptom_id`
          );
        }
        if (!Number.isInteger(s.severity) || s.severity < 0 || s.severity > 3) {
          throw new ApiError(
            'validation_error',
            'Symptom severity must be an integer between 0 and 3',
            `symptoms[${i}].severity`
          );
        }
      }

      const now = clock.now();
      const nowIso = toIsoUtc(now);
      const todayKey = utcDayKey(now);
      const checkinId = shortCheckinId();

      const beforeData = db.getCrewData(crew.id);
      const hadCheckinTodayBefore = beforeData.checkins.some(
        (c) => utcDayKey(c.created_at) === todayKey
      );

      // Compute write-time statuses including newly entered values
      const newMeasurementRows: Array<Omit<MeasurementRecord, 'id'>> = [];
      const tempMeasurements: MeasurementRecord[] = [...beforeData.measurements];
      const entryResults: CheckinEntryResult[] = [];

      let tempId = 100_000;
      for (const entry of entries) {
        const ind = indMap.get(entry.indicator_id)!;
        const val = Number(entry.value);
        const val2 = ind.input.fields.length === 2 ? Number(entry.value2) : null;
        const provisional: MeasurementRecord = {
          id: tempId++,
          crew_id: crew.id,
          checkin_id: checkinId,
          indicator_id: ind.id,
          value: val,
          value2: val2,
          measured_at: nowIso,
          status: 'normal',
        };
        const relevant = tempMeasurements
          .filter((m) => m.indicator_id === ind.id)
          .concat(provisional);
        const evalRes = evaluateIndicator(ind, relevant, crew, now);
        const computedStatus: Status =
          evalRes.status === 'no_data' ? 'normal' : evalRes.status;
        provisional.status = computedStatus;
        tempMeasurements.push(provisional);

        newMeasurementRows.push({
          crew_id: crew.id,
          checkin_id: checkinId,
          indicator_id: ind.id,
          value: val,
          value2: val2,
          measured_at: nowIso,
          status: computedStatus,
        });

        entryResults.push({
          indicator_id: ind.id,
          name: ind.name,
          value: val,
          value2: val2,
          display_value: formatDisplayValue(ind, val, val2),
          status: computedStatus,
          message: ind.messages[computedStatus],
          actions: computedStatus === 'normal' ? [] : (ind.actions[computedStatus] ?? []),
        });
      }

      // Symptom rows (+ auto-clear previously active symptoms if symptoms_reviewed is true)
      const newSymptomRows: Array<Omit<SymptomRecord, 'id'>> = [];
      const submittedSymptomIds = new Set(symptomsInput.map((s) => s.symptom_id));
      for (const s of symptomsInput) {
        newSymptomRows.push({
          crew_id: crew.id,
          checkin_id: checkinId,
          symptom_id: s.symptom_id,
          severity: s.severity,
          reported_at: nowIso,
        });
      }

      if (symptomsReviewed) {
        const latestActive = new Map<string, number>();
        for (const sr of beforeData.symptoms) {
          latestActive.set(sr.symptom_id, sr.severity);
        }
        for (const [symId, sev] of latestActive.entries()) {
          if (sev > 0 && !submittedSymptomIds.has(symId)) {
            newSymptomRows.push({
              crew_id: crew.id,
              checkin_id: checkinId,
              symptom_id: symId,
              severity: 0,
              reported_at: nowIso,
            });
          }
        }
      }

      const newCheckin = {
        id: checkinId,
        crew_id: crew.id,
        created_at: nowIso,
        note,
      };
      const allCheckinsAfter = [...beforeData.checkins, newCheckin];
      const allSymptomsAfter: SymptomRecord[] = [
        ...beforeData.symptoms,
        ...newSymptomRows.map((s, idx) => ({ ...s, id: 200_000 + idx })),
      ];

      const awardsAfter = evaluateBadgeEarns(
        crew.id,
        allCheckinsAfter,
        tempMeasurements,
        allSymptomsAfter,
        catalog,
        beforeData.badges
      );
      const beforeBadgeIds = new Set(beforeData.badges.map((b) => b.badge_id));
      const newlyEarnedAwards = awardsAfter.filter((a) => !beforeBadgeIds.has(a.badge_id));

      db.insertCheckinBundle(newCheckin, newMeasurementRows, newSymptomRows, newlyEarnedAwards);

      const postData = db.getCrewData(crew.id);
      const summaryAfter = buildSummary(crew, postData.measurements, postData.symptoms, catalog, now);
      const progressAfter = computeProgress(
        crew.id,
        postData.checkins,
        postData.measurements,
        postData.badges,
        catalog,
        now
      );

      const newBadges = progressAfter.badges.filter(
        (b) => newlyEarnedAwards.some((a) => a.badge_id === b.badge_id)
      );
      const dayPoints = hadCheckinTodayBefore ? 0 : 10;
      const pointsEarned =
        dayPoints + entries.length * 2 + newBadges.reduce((s, b) => s + b.points, 0);

      const result: CheckinResult = {
        checkin_id: checkinId,
        crew_id: crew.id,
        created_at: nowIso,
        entries: entryResults,
        insights: summaryAfter.insights,
        points_earned: pointsEarned,
        new_badges: newBadges,
        progress: progressAfter,
      };

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/crew/:crewId/history', (req, res, next) => {
    try {
      const crew = db.getCrew(req.params.crewId);
      if (!crew) {
        throw new ApiError('not_found', `Crew member '${req.params.crewId}' not found`);
      }
      const rawDays = req.query.days ?? '30';
      const days = Number(rawDays);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        throw new ApiError('validation_error', 'days must be an integer between 1 and 365', 'days');
      }

      const catalog = loadCatalog();
      const now = clock.now();
      const cutoffIso = toIsoUtc(addUtcDays(now, -days));
      const data = db.getCrewData(crew.id);

      const filteredMeasurements = data.measurements.filter((m) => m.measured_at >= cutoffIso);
      const byInd = new Map<string, MeasurementRecord[]>();
      for (const m of filteredMeasurements) {
        const list = byInd.get(m.indicator_id) ?? [];
        list.push(m);
        byInd.set(m.indicator_id, list);
      }

      const indicators = catalog.indicators.map((ind) => {
        const pts = (byInd.get(ind.id) ?? []).map((m) => ({
          id: m.id,
          checkin_id: m.checkin_id,
          value: m.value,
          value2: m.value2,
          display_value: formatDisplayValue(ind, m.value, m.value2),
          measured_at: m.measured_at,
          status: m.status,
        }));
        return {
          indicator_id: ind.id,
          name: ind.name,
          unit: ind.unit,
          region_id: ind.region_id,
          eval_mode: ind.eval_mode,
          bands: ind.bands,
          ...(ind.bands2 ? { bands2: ind.bands2 } : {}),
          points: pts,
        };
      });

      const entryCounts = new Map<string, number>();
      for (const m of data.measurements) {
        entryCounts.set(m.checkin_id, (entryCounts.get(m.checkin_id) ?? 0) + 1);
      }
      const symCounts = new Map<string, number>();
      for (const s of data.symptoms) {
        symCounts.set(s.checkin_id, (symCounts.get(s.checkin_id) ?? 0) + 1);
      }

      const recent_checkins = [...data.checkins]
        .filter((c) => c.created_at >= cutoffIso)
        .reverse()
        .slice(0, 30)
        .map((c) => ({
          id: c.id,
          created_at: c.created_at,
          note: c.note,
          entry_count: entryCounts.get(c.id) ?? 0,
          symptom_count: symCounts.get(c.id) ?? 0,
        }));

      const payload: HistoryResponse = {
        crew_id: crew.id,
        days,
        indicators,
        recent_checkins,
      };
      res.json(payload);
    } catch (err) {
      next(err);
    }
  });

  router.get('/crew/:crewId/progress', (req, res, next) => {
    try {
      const crew = db.getCrew(req.params.crewId);
      if (!crew) {
        throw new ApiError('not_found', `Crew member '${req.params.crewId}' not found`);
      }
      const catalog = loadCatalog();
      const data = db.getCrewData(crew.id);
      const progress = computeProgress(
        crew.id,
        data.checkins,
        data.measurements,
        data.badges,
        catalog,
        clock.now()
      );
      res.json(progress);
    } catch (err) {
      next(err);
    }
  });

  router.get('/crew/:crewId/report', (req, res, next) => {
    try {
      const crew = db.getCrew(req.params.crewId);
      if (!crew) {
        throw new ApiError('not_found', `Crew member '${req.params.crewId}' not found`);
      }
      const catalog = loadCatalog();
      const now = clock.now();
      const data = db.getCrewData(crew.id);
      const summary = buildSummary(crew, data.measurements, data.symptoms, catalog, now);
      const progress = computeProgress(
        crew.id,
        data.checkins,
        data.measurements,
        data.badges,
        catalog,
        now
      );
      const text = formatMedicalReport(summary, progress);
      res.json({
        crew_id: crew.id,
        generated_at: toIsoUtc(now),
        text,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/dev/scenarios', (_req, res) => {
    res.json(SCENARIOS);
  });

  router.post('/dev/scenario', (req, res, next) => {
    try {
      const body = req.body ?? {};
      const crewId = body.crew_id;
      const scenarioId = body.scenario_id;
      const crew = db.getCrew(crewId);
      if (!crew) {
        throw new ApiError('not_found', `Crew member '${String(crewId)}' not found`, 'crew_id');
      }
      const validScenario = SCENARIOS.some((s) => s.id === scenarioId);
      if (!validScenario) {
        throw new ApiError(
          'validation_error',
          `Unknown scenario_id '${String(scenarioId)}'`,
          'scenario_id'
        );
      }
      const catalog = loadCatalog();
      const now = clock.now();
      db.applyScenarioForCrew(crew, scenarioId, catalog, now);
      const data = db.getCrewData(crew.id);
      const summary = buildSummary(crew, data.measurements, data.symptoms, catalog, now);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  router.post('/dev/reset', (_req, res, next) => {
    try {
      db.resetAndSeedAll(clock);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
