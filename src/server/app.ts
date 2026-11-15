import express from 'express';
import { loadCatalog } from '../engine/catalog.ts';
import { createApiRouter } from './api.ts';
import { resolveDbPath, VigilDatabase } from './db.ts';
import { apiErrorHandler } from './errors.ts';

/**
 * Builds the Vigil Express application (API only).
 * Static assets are served separately: by Vite in development and by the
 * Vercel CDN (or express.static in `server.ts` for self-hosting) in production.
 */
export function createVigilApp(): express.Express {
  // Validate catalog exists at startup
  loadCatalog();

  const db = new VigilDatabase(resolveDbPath());
  db.ensureSeeded();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // CORS for local development
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173') {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use('/api', createApiRouter(db));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'API endpoint not found' } });
  });
  app.use(apiErrorHandler);

  return app;
}
