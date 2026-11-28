// ORIGIN local operator dashboard. Listens on 127.0.0.1 only.
// - Shows which secrets are configured (filled/empty), never their values.
// - TikTok: client check, Login Kit OAuth (read scopes), token exchange/refresh into the git-ignored .env, read-only scope probes.
// - Database: health as origin_app (password from macOS keychain), per tenant under RLS.
// Never publishes, uploads or deletes anything. Start: cd tools/dashboard && npm i && npm start
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.resolve(HERE, '../../.env');
const PORT = Number(process.env.PORT || 4790);
const N8N_CALLBACK = 'https://aiagencydanmark.app.n8n.cloud/rest/oauth2-credential/callback';
const READ_SCOPES = 'user.info.basic,user.info.profile,user.info.stats,video.list';
const SESSION = crypto.randomBytes(24).toString('hex'); // CSRF token embedded in the page
const pendingStates = new Map(); // state -> created ms
const activity = [];

// ---------- .env (read fresh each time, written in place, mode 600)
const readEnv = () => {
  const o = {};
  if (!fs.existsSync(ENV_FILE)) return o;
  for (const l of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (m) o[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return o;
};
const writeEnv = (updates) => {
  let s = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp(`^${k}=.*$`, 'm');
    s = re.test(s) ? s.replace(re, () => `${k}=${v}`) : s.replace(/\n?$/, '\n') + `${k}=${v}\n`;
  }
  fs.writeFileSync(ENV_FILE, s, { mode: 0o600 });
  fs.chmodSync(ENV_FILE, 0o600);
};

// ---------- redaction: every response passes through this
const redact = (x) => {
  const env = readEnv();
  let s = JSON.stringify(x);
  for (const [k, v] of Object.entries(env)) {
    if (v && v.length >= 8 && /SECRET|TOKEN|KEY|PASSWORD/.test(k) && k !== 'TIKTOK_CLIENT_KEY') s = s.split(v).join('[REDACTED]');
  }
  return JSON.parse(s.replace(/\b(act|rft|clt)\.[A-Za-z0-9!*._-]{10,}/g, '[REDACTED]'));
};
const log = (area, msg, ok = true) => { activity.unshift({ at: new Date().toISOString(), area, msg, ok }); activity.length = Math.min(activity.length, 200); };

// ---------- status
const SECRET_GROUPS = {
  TikTok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URI', 'TIKTOK_ACCESS_TOKEN', 'TIKTOK_REFRESH_TOKEN'],
  'Meta (paused)': ['META_APP_ID', 'META_APP_SECRET', 'META_ENCRYPTED_KEY', 'META_WEBHOOK_VERIFY_TOKEN', 'INSTAGRAM_ACCESS_TOKEN'],
};
const status = () => {
  const env = readEnv();
  const groups = {};
  for (const [g, keys] of Object.entries(SECRET_GROUPS)) {
    groups[g] = keys.map((k) => ({ key: k, filled: !!env[k], note: k === 'TIKTOK_REDIRECT_URI' && env[k] ? (env[k] === N8N_CALLBACK ? 'matches n8n callback' : 'DIFFERS from n8n callback') : undefined }));
  }
  return {
    envFile: fs.existsSync(ENV_FILE) ? 'present (git-ignored, mode ' + (fs.statSync(ENV_FILE).mode & 0o777).toString(8) + ')' : 'missing',
    groups,
    tiktokToken: { accessExpiresAt: env.TIKTOK_ACCESS_EXPIRES_AT || null, refreshExpiresAt: env.TIKTOK_REFRESH_EXPIRES_AT || null, grantedScopes: env.TIKTOK_GRANTED_SCOPES || null },
  };
};

// ---------- TikTok
const tokenCall = async (params) => {
  const r = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' }, body: new URLSearchParams(params) });
  return { http: r.status, j: await r.json().catch(() => ({})) };
};
const saveTokens = (j) => {
  const now = Date.now();
  writeEnv({
    TIKTOK_ACCESS_TOKEN: j.access_token, TIKTOK_REFRESH_TOKEN: j.refresh_token,
    TIKTOK_ACCESS_EXPIRES_AT: new Date(now + j.expires_in * 1000).toISOString(),
    TIKTOK_REFRESH_EXPIRES_AT: new Date(now + j.refresh_expires_in * 1000).toISOString(),
    TIKTOK_GRANTED_SCOPES: j.scope || '',
  });
};
const tiktok = {
  async clientCheck() {
    const e = readEnv();
    if (!e.TIKTOK_CLIENT_KEY || !e.TIKTOK_CLIENT_SECRET) return { ok: false, error: 'client key/secret missing in .env' };
    const { http, j } = await tokenCall({ client_key: e.TIKTOK_CLIENT_KEY, client_secret: e.TIKTOK_CLIENT_SECRET, grant_type: 'client_credentials' });
    const ok = !!j.access_token; // client token is discarded
    log('TikTok', ok ? 'client key/secret valid' : `client check failed: ${j.error}`, ok);
    return { ok, http, expires_in: j.expires_in, error: j.error, error_description: j.error_description };
  },
  start({ scopes }) {
    const e = readEnv();
    if (!e.TIKTOK_CLIENT_KEY || !e.TIKTOK_REDIRECT_URI) return { ok: false, error: 'client key / redirect URI missing in .env' };
    const scope = String(scopes || READ_SCOPES).split(',').map((s) => s.trim()).filter((s) => /^[a-z.]+$/.test(s) && !/publish|upload/.test(s)).join(',');
    const state = crypto.randomBytes(16).toString('hex');
    pendingStates.set(state, Date.now());
    const u = new URL('https://www.tiktok.com/v2/auth/authorize/');
    u.search = new URLSearchParams({ client_key: e.TIKTOK_CLIENT_KEY, response_type: 'code', scope, redirect_uri: e.TIKTOK_REDIRECT_URI, state }).toString();
    log('TikTok', `login started (scopes: ${scope})`);
    return { ok: true, url: u.toString(), scope };
  },
  async finish({ url }) {
    let u; try { u = new URL(String(url).trim()); } catch { return { ok: false, error: 'not a URL' }; }
    const p = u.searchParams;
    if (p.get('error')) { log('TikTok', `login refused: ${p.get('error')}`, false); return { ok: false, error: p.get('error'), error_description: p.get('error_description') }; }
    const st = p.get('state');
    if (!st || !pendingStates.has(st) || Date.now() - pendingStates.get(st) > 15 * 60e3) return { ok: false, error: 'unknown or expired state: press "Start TikTok login" again' };
    pendingStates.delete(st);
    const code = p.get('code'); if (!code) return { ok: false, error: 'no code in URL' };
    const e = readEnv();
    const { http, j } = await tokenCall({ client_key: e.TIKTOK_CLIENT_KEY, client_secret: e.TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: e.TIKTOK_REDIRECT_URI });
    if (!j.access_token) { log('TikTok', `code exchange failed: ${j.error}`, false); return { ok: false, http, error: j.error, error_description: j.error_description }; }
    saveTokens(j);
    log('TikTok', `tokens saved to .env (scopes: ${j.scope})`);
    return { ok: true, granted_scopes: j.scope, expires_in: j.expires_in, refresh_expires_in: j.refresh_expires_in };
  },
  async refresh() {
    const e = readEnv();
    if (!e.TIKTOK_REFRESH_TOKEN) return { ok: false, error: 'no refresh token yet' };
    const { http, j } = await tokenCall({ client_key: e.TIKTOK_CLIENT_KEY, client_secret: e.TIKTOK_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: e.TIKTOK_REFRESH_TOKEN });
    if (!j.access_token) { log('TikTok', `refresh failed: ${j.error}`, false); return { ok: false, http, error: j.error, error_description: j.error_description }; }
    saveTokens(j);
    log('TikTok', 'access token refreshed');
    return { ok: true, granted_scopes: j.scope, expires_in: j.expires_in };
  },
  async probes() {
    const e = readEnv();
    if (!e.TIKTOK_ACCESS_TOKEN) return { ok: false, error: 'no access token yet: do the login first' };
    const H = { Authorization: `Bearer ${e.TIKTOK_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
    const probe = async (label, scope, url, init = {}) => {
      const r = await fetch(url, { headers: H, ...init }); const j = await r.json().catch(() => ({}));
      const code = j.error?.code;
      return { label, scope, http: r.status, result: code === 'ok' ? 'OK' : code || 'error', message: code === 'ok' ? undefined : (j.error?.message || '').slice(0, 160), data: code === 'ok' ? j.data : undefined };
    };
    const res = [
      await probe('User basic', 'user.info.basic', 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url'),
      await probe('User profile', 'user.info.profile', 'https://open.tiktokapis.com/v2/user/info/?fields=username,is_verified,profile_deep_link,bio_description'),
      await probe('User stats', 'user.info.stats', 'https://open.tiktokapis.com/v2/user/info/?fields=follower_count,following_count,video_count,likes_count'),
      await probe('Latest videos (Display API)', 'video.list', 'https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,title,share_url,view_count,like_count,comment_count,share_count,duration', { method: 'POST', body: JSON.stringify({ max_count: 10 }) }),
      // creator_info only reads posting options; it creates and uploads nothing.
      await probe('Posting permissions (read only)', 'video.publish', 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/', { method: 'POST', body: '{}' }),
    ];
    log('TikTok', 'scope probes: ' + res.map((r) => `${r.scope}=${r.result}`).join(', '));
    return { ok: true, results: res };
  },
};

// ---------- database (origin_app, RLS per tenant)
let pgMod = null;
const db = async () => {
  pgMod ||= (await import('pg')).default;
  let pw;
  try { pw = execFileSync('security', ['find-generic-password', '-s', 'origin-app-db-sunny-perception', '-w'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return { ok: false, error: 'origin_app password not found in macOS keychain (origin-app-db-sunny-perception)' }; }
  const c = new pgMod.Client({ host: 'roundhouse.proxy.rlwy.net', port: 17500, database: 'railway', user: 'origin_app', password: pw, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try {
    await c.connect();
    const q = async (sql, p) => (await c.query(sql, p)).rows;
    const hb = await q(`SELECT checked_at, status, left(coalesce(detail::text,''),160) detail FROM heartbeat_log ORDER BY checked_at DESC LIMIT 5`);
    const tenants = (await q('SELECT id FROM origin_list_automation_tenants() ORDER BY 1')).map((r) => r.id);
    const perTenant = [];
    for (const t of tenants) {
      await c.query('BEGIN READ ONLY');
      await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [t]);
      perTenant.push({
        tenant: t,
        jobs: await q(`SELECT job_type, status, count(*)::int n FROM jobs GROUP BY 1,2 ORDER BY 1,2`),
        recentJobs: await q(`SELECT id, job_type, status, attempt_count, max_attempts, updated_at, left(coalesce(last_error,''),120) last_error FROM jobs ORDER BY updated_at DESC NULLS LAST LIMIT 5`),
        unreadNotifications: (await q(`SELECT count(*)::int n FROM notifications WHERE NOT is_read`))[0].n,
        errors24h: (await q(`SELECT count(*)::int n FROM automation_errors WHERE created_at > now() - interval '24 hours'`))[0].n,
        connections: await q(`SELECT brand_id, platform, status, can_read_insights, can_publish, last_checked_at FROM social_connections ORDER BY 1,2`),
        trendSignals: (await q(`SELECT count(*)::int n FROM trend_signals`))[0].n,
      });
      await c.query('COMMIT');
    }
    return { ok: true, role: 'origin_app (RLS enforced)', heartbeat: hb, tenants: perTenant };
  } catch (err) {
    return { ok: false, error: String(err.message || err).slice(0, 200) };
  } finally { await c.end().catch(() => {}); }
};

// ---------- http
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'" });
  res.end(type === 'application/json' ? JSON.stringify(redact(body)) : body);
};
const readBody = (req) => new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > 1e5) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } }); });

const html = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
const server = http.createServer(async (req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  if (!['127.0.0.1', 'localhost'].includes(host)) return send(res, 403, { error: 'local only' }); // DNS-rebinding guard
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, html.replace('__SESSION__', SESSION), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, { ...status(), activity });
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      const origin = req.headers.origin || '';
      if (req.headers['x-session'] !== SESSION || (origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))) return send(res, 403, { error: 'bad session' });
      const body = await readBody(req);
      const routes = {
        '/api/tiktok/client-check': () => tiktok.clientCheck(),
        '/api/tiktok/start': () => tiktok.start(body),
        '/api/tiktok/finish': () => tiktok.finish(body),
        '/api/tiktok/refresh': () => tiktok.refresh(),
        '/api/tiktok/probes': () => tiktok.probes(),
        '/api/db': () => db(),
      };
      if (routes[url.pathname]) return send(res, 200, await routes[url.pathname]());
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    log('server', String(err.message || err).slice(0, 160), false);
    send(res, 500, { error: String(err.message || err).slice(0, 200) });
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`ORIGIN dashboard: http://127.0.0.1:${PORT}  (local only; .env: ${fs.existsSync(ENV_FILE) ? 'found' : 'missing'})`));
