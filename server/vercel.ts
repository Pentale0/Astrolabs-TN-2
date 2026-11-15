import type { IncomingMessage, ServerResponse } from 'node:http';
import { createVigilApp } from '../src/server/app.ts';

// Vercel's serverless filesystem is read-only except for /tmp, so the SQLite
// database is created there. It is per-instance and does not persist across
// cold starts, which is fine for this demo app (it re-seeds on first request).
process.env.VIGIL_DATA_DIR ??= '/tmp/vigil-data';

let app: ReturnType<typeof createVigilApp> | null = null;

function getApp() {
  if (!app) {
    app = createVigilApp();
  }
  return app;
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return getApp()(req, res);
}
