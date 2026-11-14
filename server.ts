import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { loadCatalog } from './src/engine/catalog.ts';
import { createApiRouter } from './src/server/api.ts';
import { resolveDbPath, VigilDatabase } from './src/server/db.ts';
import { apiErrorHandler } from './src/server/errors.ts';

async function startServer() {
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

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`[vigil] Server listening on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('[vigil] Fatal startup error:', err);
  process.exit(1);
});
