# Vigil — Astronaut Health Monitor

Mission health monitoring console for long-duration spaceflight crew: body-region
diagnostics, spaceflight hazard insights, autonomous escalation guidance, and flight
surgeon reporting. Built around NASA's five hazards of human spaceflight.

## 🚀 Live demo

**https://astrolabs-tn.vercel.app**

Deployed on Vercel (production). The database re-seeds automatically, so the app is
always populated with a nominal 45-day mission baseline.

## Features

- **Body-region diagnostics** — seven regions (neuro-ocular, cardiovascular, metabolic,
  musculoskeletal, behavioral/sleep, immune/radiation) with per-indicator status,
  sparklines and cadence tracking.
- **Check-ins** — log vitals, symptoms and notes; the engine evaluates thresholds,
  trends and mean-7d/cadence rules on write.
- **Hazard insights** — ranked insights tied to mission hazards, with concrete actions.
- **Escalation guidance** — comm-delay-aware escalation for autonomous crew operations.
- **Progress & badges** — streaks, coverage and earned badges.
- **Flight surgeon report** — generated plain-text medical summary per crew member.
- **Dev scenarios** — eight seed scenarios (`nominal`, `sans_risk`, `cardio_deconditioning`,
  `sleep_circadian`, `radiation_immune`, `metabolic_bone`, `eva_hypoxia`,
  `baseline_empty`) to demo every state.

## Stack

React 19 + Vite 8 + Tailwind 4 on the client, Express 4 on the server, SQLite via
Node's built-in `node:sqlite`, TypeScript throughout, lucide-react + motion for UI.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000 (Express + Vite middleware)
```

Other scripts:

```bash
npm run build        # client bundle (dist/) + Vercel function bundle
npm start            # production server (NODE_ENV=production, serves dist/)
npm run lint         # tsc --noEmit
npm test             # engine + API tests
```

## Deployment

The app runs as a single Vercel serverless function:

- `api/index.js` — Vercel entrypoint, re-exports the handler.
- `server/vercel.ts` — serverless handler; bundled to `api/_vigil.mjs` by `npm run build`.
- `src/server/app.ts` — shared `createVigilApp()` used by both the handler and `server.ts`.
- `vercel.json` — static `dist/` output, `/api/*` → function, SPA fallback, and
  `includeFiles` so `shared/catalog.json` ships with the function.

```bash
vercel deploy --prod
```

> **Data persistence:** Vercel's filesystem is read-only except `/tmp`, so the SQLite
> database lives in `/tmp` and is scoped to a single function instance. It is wiped on
> cold starts and not shared between instances — fine for a demo, but production would
> need Postgres, Turso/libSQL or another hosted store.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check + catalog version |
| `GET` | `/api/catalog` | Indicator catalogue |
| `GET` | `/api/crew` | List crew |
| `GET` | `/api/crew/:id` | Crew member detail |
| `PATCH` | `/api/crew/:id` | Update crew profile |
| `GET` | `/api/crew/:id/summary` | Body-region summary + insights |
| `POST` | `/api/crew/:id/checkins` | Submit a check-in |
| `GET` | `/api/crew/:id/history?days=30` | Trends history |
| `GET` | `/api/crew/:id/progress` | Streaks, coverage, badges |
| `GET` | `/api/crew/:id/report` | Flight surgeon report |
| `GET` | `/api/dev/scenarios` | Available demo scenarios |
| `POST` | `/api/dev/scenario` | Apply a scenario to a crew member |
| `POST` | `/api/dev/reset` | Reseed all crew data |
