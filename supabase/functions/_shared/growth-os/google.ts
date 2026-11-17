// Server-side Google clients for Growth OS: a service-account access token
// (JWT bearer flow, RS256 via WebCrypto), the GA4 Data API and the Search Console
// Search Analytics API. Read-only scopes. The key never leaves the server.
//
// Docs: https://developers.google.com/identity/protocols/oauth2/service-account
//       https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
//       https://developers.google.com/webmaster-tools/v1/searchanalytics/query

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

export interface ServiceAccount { client_email: string; private_key: string; token_uri?: string }

export interface GoogleDeps {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

/** Raised for 401/403/404: the service account has no access to that property or site. */
export class GoogleAccessError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
/** Raised after retries are exhausted (429/5xx/timeouts). */
export class GoogleUnavailableError extends Error {}

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    if (!sa.client_email || !sa.private_key?.includes("PRIVATE KEY")) return null;
    return sa;
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function signJwt(sa: ServiceAccount, nowSec: number): Promise<string> {
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const unsigned = `${b64urlJson({ alg: "RS256", typ: "JWT" })}.${b64urlJson({
    iss: sa.client_email, scope: GOOGLE_SCOPES.join(" "), aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: nowSec, exp: nowSec + 3600,
  })}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  return `${unsigned}.${b64url(sig)}`;
}

export class GoogleClient {
  private token: { value: string; expiresAt: number } | null = null;
  constructor(private sa: ServiceAccount, private deps: GoogleDeps, private timeoutMs = 20_000, private maxAttempts = 3) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > this.deps.now()) return this.token.value;
    const assertion = await signJwt(this.sa, Math.floor(this.deps.now() / 1000));
    const res = await this.deps.fetch(this.sa.token_uri ?? "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !body.access_token) throw new GoogleAccessError(`token: ${body.error_description ?? res.status}`, res.status);
    this.token = { value: body.access_token, expiresAt: this.deps.now() + (body.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  /** POST JSON with retries for 429/5xx/network errors and exponential backoff. */
  async post<T>(url: string, payload: unknown): Promise<T> {
    let last = "";
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const res = await this.deps.fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (res.ok) return await res.json() as T;
        const text = (await res.text()).slice(0, 300);
        if (res.status === 401 || res.status === 403 || res.status === 404) throw new GoogleAccessError(`${res.status}: ${text}`, res.status);
        last = `${res.status}: ${text}`;
        if (res.status !== 429 && res.status < 500) throw new GoogleUnavailableError(last);
      } catch (e) {
        if (e instanceof GoogleAccessError || e instanceof GoogleUnavailableError) throw e;
        last = (e as Error).message;
      }
      if (attempt < this.maxAttempts) await this.deps.sleep(1000 * 2 ** (attempt - 1));
    }
    throw new GoogleUnavailableError(`gave up after ${this.maxAttempts} attempts: ${last}`);
  }
}

// ── GA4 Data API ───────────────────────────────────────────────────────────
interface Ga4Row { dimensionValues: { value: string }[]; metricValues: { value: string }[] }
interface Ga4Response { rows?: Ga4Row[]; rowCount?: number; propertyQuota?: { tokensPerDay?: { remaining?: number } } }

export interface Ga4DailyRow { day: string; channel_group: string; sessions: number; active_users: number; engaged_sessions: number; key_events: number }
export interface Ga4LandingRow { day: string; landing_page: string; channel_group: string; sessions: number; engaged_sessions: number; key_events: number }

const ga4Day = (v: string) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`; // GA4 "date" is YYYYMMDD
const num = (v: string | undefined) => (v === undefined || v === "" ? 0 : Number(v));

export async function ga4Daily(g: GoogleClient, propertyId: string, from: string, to: string) {
  const r = await g.post<Ga4Response>(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "engagedSessions" }, { name: "keyEvents" }],
    limit: 10000, keepEmptyRows: false, returnPropertyQuota: true,
  });
  const rows: Ga4DailyRow[] = (r.rows ?? []).map((x) => ({
    day: ga4Day(x.dimensionValues[0].value), channel_group: x.dimensionValues[1].value || "(not set)",
    sessions: num(x.metricValues[0].value), active_users: num(x.metricValues[1].value),
    engaged_sessions: num(x.metricValues[2].value), key_events: num(x.metricValues[3].value),
  }));
  return { rows, quotaRemaining: r.propertyQuota?.tokensPerDay?.remaining ?? null };
}

export async function ga4Landing(g: GoogleClient, propertyId: string, from: string, to: string, limit = 2500) {
  const r = await g.post<Ga4Response>(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: "date" }, { name: "landingPagePlusQueryString" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "keyEvents" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit, keepEmptyRows: false,
  });
  const rows: Ga4LandingRow[] = (r.rows ?? []).map((x) => ({
    day: ga4Day(x.dimensionValues[0].value),
    // Query strings can carry personal data: keep the path only.
    landing_page: (x.dimensionValues[1].value || "(not set)").split("?")[0].slice(0, 500),
    channel_group: x.dimensionValues[2].value || "(not set)",
    sessions: num(x.metricValues[0].value), engaged_sessions: num(x.metricValues[1].value), key_events: num(x.metricValues[2].value),
  }));
  // Dropping the query string can merge rows: sum them so the key stays unique.
  const merged = new Map<string, Ga4LandingRow>();
  for (const row of rows) {
    const k = `${row.day}|${row.landing_page}|${row.channel_group}`;
    const m = merged.get(k);
    if (m) { m.sessions += row.sessions; m.engaged_sessions += row.engaged_sessions; m.key_events += row.key_events; }
    else merged.set(k, { ...row });
  }
  return [...merged.values()];
}

// ── Search Console ─────────────────────────────────────────────────────────
interface GscResponse { rows?: { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }[] }
export interface GscDailyRow { day: string; clicks: number; impressions: number; ctr: number; position: number }
export interface GscQueryPageRow extends GscDailyRow { query: string; page: string }

const gscUrl = (site: string) => `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;

export async function gscDaily(g: GoogleClient, site: string, from: string, to: string): Promise<GscDailyRow[]> {
  const r = await g.post<GscResponse>(gscUrl(site), { startDate: from, endDate: to, dimensions: ["date"], rowLimit: 1000, dataState: "final" });
  return (r.rows ?? []).map((x) => ({ day: x.keys![0], clicks: x.clicks, impressions: x.impressions, ctr: x.ctr, position: x.position }));
}

export async function gscQueryPage(g: GoogleClient, site: string, from: string, to: string, rowLimit = 5000): Promise<GscQueryPageRow[]> {
  const r = await g.post<GscResponse>(gscUrl(site), { startDate: from, endDate: to, dimensions: ["date", "query", "page"], rowLimit, dataState: "final" });
  return (r.rows ?? []).map((x) => ({ day: x.keys![0], query: x.keys![1].slice(0, 500), page: x.keys![2].slice(0, 500), clicks: x.clicks, impressions: x.impressions, ctr: x.ctr, position: x.position }));
}
