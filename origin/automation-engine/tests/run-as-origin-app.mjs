// Runs security-dryrun.mjs logged in as origin_app; the password is read from the macOS keychain and never printed.
// Usage: node run-as-origin-app.mjs <noop.sql> ../workflows/tenant-scoped-queries.json

import { execFileSync } from 'child_process';
const pw = execFileSync('security', ['find-generic-password', '-s', 'origin-app-db-sunny-perception', '-w']).toString().trim();
process.env.DBURL = `postgres://origin_app:${encodeURIComponent(pw)}@roundhouse.proxy.rlwy.net:17500/railway`;
await import('./security-dryrun.mjs');
