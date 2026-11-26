Summary: Neither folder holds the full source code. Dynamic-Forecast-Management is build output only. RFQ-BOM-Control is a mix: build output for the frontend, real source for the backend, and live data. The two are separate projects with a loose one-way link: each app runs its own frontend and backend, and the Forecast app also reads BOM data from the RFQ backend.

1. Dynamic-Forecast-Management: build output only

┌────────────────────────────────────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┐
│                                            Content                                             │                           What it is                            │
├────────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ dist/ (48 minified hashed bundles, one index.html per route, service-worker.js, manifest.json) │ Vite production build of a React 19 app                         │
├────────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ package.json, package-lock.json                                                                │ Copied from the dev repo                                        │
├────────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ DEPLOY.md                                                                                      │ Says "production frontend… deploy dist/ to any static web host" │
└────────────────────────────────────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────┘

- Missing: src/, vite.config.*, index.html source, server/, scripts/.
- package.json still points to files that aren't there: dev:api: node server/index.js and check:pwa: scripts/check-pwa-config.mjs. Its dependencies also include backend packages (express, better-sqlite3, jsonwebtoken, bcryptjs).
- So the original project had its own Express backend (the bundle calls it at http://127.0.0.1:8790, using /api/bootstrap, /api/forecast/cell and /api/customers). That backend was not included.
- By default it runs on browser localStorage (57 references in the bundle). Git has a single init commit containing only these files.

2. RFQ-BOM-Control: source mixed with build output and data

┌───────────────────────────────────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────┐
│                                            Content                                            │                       What it is                        │
├───────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ dist/                                                                                         │ Build output: the minified React frontend               │
├───────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ server/ (~30 .mjs files: Express routes, SQLite store, cache, backup, SSE, tests, schema.sql) │ Real source code: readable, unminified, with unit tests │
├───────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ data/ (rfq.db plus -wal/-shm, users.json, roles.json, backups)                                │ Runtime data, a live database snapshot                  │
├───────────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
│ package.json, DEPLOY.md                                                                       │ Deploy package: "production frontend and API"           │
└───────────────────────────────────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────┘

- Missing: the frontend src/, electron/ (it is main in package.json, and electron:build is set up) and scripts/ (used by the seed:*, report:* and test:i18n scripts).
- So you could keep developing the backend from this folder, but not the frontend.
- ⚠️ data/ is committed to git, including rfq.db and users.json. The admin password is stored as "YWRtaW4=", which is just base64 for admin, so effectively plaintext. The repo has a GitHub remote (ADVANTECH-NOGATA-MEG/RFQ-BOM-Control), so check whether this has been pushed.

Both folders also contain .vs/, which is Visual Studio workspace cache. It is untracked and not part of either project.

3. How the two relate

They are two separate full-stack apps, not one frontend paired with one backend. Each has its own frontend, backend, login and data store. They are connected in two places:

- Forecast → RFQ backend (data link): the Forecast bundle fetches BOMs from the RFQ API. It tries http://127.0.0.1:3001/api/boms, then :3001, then :5174/api (the RFQ API and dev ports), and its error message names it "RFQ BOM API". The RFQ server listens on port 3001 (server/config.mjs:10) and allows cross-origin requests from any site (server/index.mjs:26).
- RFQ frontend → Forecast frontend (navigation link): forecastLink-*.js opens http://127.0.0.1:5190/#/login in a new tab. That's just a link to the other app; no data is shared.

The RFQ server has no forecast, customer or product endpoints; those come from Forecast's own backend on port 8790, which is missing. So Forecast relies on RFQ for BOM data, but RFQ does not rely on Forecast. The link addresses are hardcoded to 127.0.0.1, so they only work if both apps run on the same machine.

What this means

- To rebuild or change either frontend, you need the original source repos. These folders contain only deploy packages.
- Dynamic-Forecast-Management is also missing its backend (port 8790). Without it, the app falls back to localStorage.
- Only the RFQ backend (RFQ-BOM-Control/server/) is maintainable as-is.