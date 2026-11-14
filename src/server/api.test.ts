import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { loadCatalogRaw } from '../engine/catalog.ts';
import { createApiRouter } from './api.ts';
import { VigilDatabase } from './db.ts';
import { apiErrorHandler } from './errors.ts';

function setupTestApp() {
  const fixedNow = new Date('2026-11-14T12:00:00Z');
  const clock = { now: () => fixedNow };
  const db = new VigilDatabase(':memory:');
  db.ensureSeeded(clock);

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter(db, clock));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  });
  app.use(apiErrorHandler);
  return { app, db };
}

async function withServer<T>(
  app: express.Express,
  fn: (baseUrl: string) => Promise<T>
): Promise<T> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('GET /api/catalog matches shared/catalog.json exactly and /api/health returns ok', async () => {
  const { app } = setupTestApp();
  await withServer(app, async (base) => {
    const healthRes = await fetch(`${base}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.ok, true);

    const catRes = await fetch(`${base}/api/catalog`);
    assert.equal(catRes.status, 200);
    const cat = await catRes.json();
    assert.deepEqual(cat, JSON.parse(loadCatalogRaw()));
  });
});

test('crew summary, 404/422 error shapes, and environment patch work per contract', async () => {
  const { app } = setupTestApp();
  await withServer(app, async (base) => {
    const missing = await fetch(`${base}/api/crew/unknown_id/summary`);
    assert.equal(missing.status, 404);
    const missingBody = await missing.json();
    assert.equal(missingBody.error.code, 'not_found');

    const badEnv = await fetch(`${base}/api/crew/c1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment: 'jupiter_orbit' }),
    });
    assert.equal(badEnv.status, 422);
    const badEnvBody = await badEnv.json();
    assert.equal(badEnvBody.error.code, 'validation_error');
    assert.equal(badEnvBody.error.field, 'environment');

    const goodEnv = await fetch(`${base}/api/crew/c1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment: 'mars_base' }),
    });
    assert.equal(goodEnv.status, 200);
    const updatedCrew = await goodEnv.json();
    assert.equal(updatedCrew.environment, 'mars_base');

    const summaryRes = await fetch(`${base}/api/crew/c1/summary`);
    assert.equal(summaryRes.status, 200);
    const summary = await summaryRes.json();
    assert.equal(summary.regions.length, 6);
    assert.equal(summary.overall_status, 'normal');
    assert.equal(summary.escalation.autonomous_protocol, true);
  });
});

test('POST checkins validates ranges/value2 and clears symptoms when symptoms_reviewed=true', async () => {
  const { app } = setupTestApp();
  await withServer(app, async (base) => {
    // Out-of-range value -> 422 with entries[0].value
    const badRange = await fetch(`${base}/api/crew/c1/checkins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [{ indicator_id: 'heart_rate', value: 999 }],
      }),
    });
    assert.equal(badRange.status, 422);
    const badRangeBody = await badRange.json();
    assert.equal(badRangeBody.error.code, 'validation_error');
    assert.equal(badRangeBody.error.field, 'entries[0].value');

    // Missing value2 for blood_pressure -> 422
    const badBp = await fetch(`${base}/api/crew/c1/checkins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [{ indicator_id: 'blood_pressure', value: 118 }],
      }),
    });
    assert.equal(badBp.status, 422);
    const badBpBody = await badBp.json();
    assert.equal(badBpBody.error.field, 'entries[0].value2');

    // Valid check-in on c2 (which starts with sans_risk active symptoms) with symptoms_reviewed=true
    const goodCk = await fetch(`${base}/api/crew/c2/checkins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [
          { indicator_id: 'blood_pressure', value: 120, value2: 78 },
          { indicator_id: 'intraocular_pressure', value: 16.0 },
        ],
        symptoms: [],
        symptoms_reviewed: true,
        note: 'Recovery check',
      }),
    });
    assert.equal(goodCk.status, 201);
    const ckResult = await goodCk.json();
    assert.match(ckResult.checkin_id, /^ck_/);
    assert.equal(ckResult.entries.length, 2);
    assert.equal(ckResult.points_earned, 14); // 10 new UTC day + 2*2 entries

    const c2SummaryRes = await fetch(`${base}/api/crew/c2/summary`);
    const c2Summary = await c2SummaryRes.json();
    assert.equal(c2Summary.overall_status, 'normal');
  });
});

test('history, progress, report, scenarios, and reset endpoints work end-to-end', async () => {
  const { app } = setupTestApp();
  await withServer(app, async (base) => {
    const scRes = await fetch(`${base}/api/dev/scenarios`);
    assert.equal(scRes.status, 200);
    const scenarios = await scRes.json();
    assert.equal(scenarios.length, 8);

    const switchRes = await fetch(`${base}/api/dev/scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crew_id: 'c1', scenario_id: 'radiation_immune' }),
    });
    assert.equal(switchRes.status, 200);
    const switched = await switchRes.json();
    assert.equal(switched.overall_status, 'alert');
    assert.ok(switched.insights.some((i: { id: string }) => i.id === 'immune_radiation_cluster'));

    const histRes = await fetch(`${base}/api/crew/c1/history?days=14`);
    assert.equal(histRes.status, 200);
    const hist = await histRes.json();
    assert.equal(hist.days, 14);

    const progRes = await fetch(`${base}/api/crew/c1/progress`);
    assert.equal(progRes.status, 200);
    const prog = await progRes.json();
    assert.equal(prog.badges.length, 7);

    const repRes = await fetch(`${base}/api/crew/c1/report`);
    assert.equal(repRes.status, 200);
    const rep = await repRes.json();
    assert.match(rep.text, /VIGIL MISSION MEDICAL TELEMETRY REPORT/);

    const resetRes = await fetch(`${base}/api/dev/reset`, { method: 'POST' });
    assert.equal(resetRes.status, 200);
    const afterReset = await (await fetch(`${base}/api/crew/c1/summary`)).json();
    assert.equal(afterReset.overall_status, 'normal');
  });
});
