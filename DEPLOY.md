RFQ BOM Control - production frontend and API

Frontend:
  Deploy dist/ to a static web host.

API:
  npm install --omit=dev
  PORT=3001 node server/index.mjs

The included data/ directory contains the current local RFQ database and backups.
Set the frontend API base URL to the deployed API origin when hosting separately.
