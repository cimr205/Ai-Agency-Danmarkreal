import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ga4Daily, ga4Landing, GoogleAccessError, GoogleClient, GoogleUnavailableError, gscQueryPage, parseServiceAccount } from "./google.ts";

async function serviceAccount() {
  const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  return { sa: { client_email: "sa@test.iam.gserviceaccount.com", private_key: pem }, publicKey: kp.publicKey };
}

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; body: string; auth: string }[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: String(init?.body ?? ""), auth: new Headers(init?.headers).get("Authorization") ?? "" });
    if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
    return handler(url, init!);
  }) as typeof fetch;
  return { f, calls };
}
const deps = (f: typeof fetch) => ({ fetch: f, now: () => 1_800_000_000_000, sleep: () => Promise.resolve() });

Deno.test("service account JSON is validated", () => {
  assertEquals(parseServiceAccount(undefined), null);
  assertEquals(parseServiceAccount("{"), null);
  assertEquals(parseServiceAccount(JSON.stringify({ client_email: "x" })), null);
});

Deno.test("signs a valid RS256 JWT with read-only scopes and reuses the token", async () => {
  const { sa, publicKey } = await serviceAccount();
  const { f, calls } = fakeFetch(() => new Response(JSON.stringify({ rows: [] })));
  const g = new GoogleClient(sa, deps(f));
  await ga4Daily(g, "533214056", "2026-11-01", "2026-11-14");
  await ga4Daily(g, "533214056", "2026-11-01", "2026-11-14");
  assertEquals(calls.filter((c) => c.url.includes("oauth2")).length, 1);
  const jwt = new URLSearchParams(calls[0].body).get("assertion")!;
  const [h, p, s] = jwt.split(".");
  const dec = (x: string) => Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  assert(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, dec(s), new TextEncoder().encode(`${h}.${p}`)));
  const claims = JSON.parse(new TextDecoder().decode(dec(p)));
  assertEquals(claims.scope, "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly");
  assertEquals(calls[1].auth, "Bearer tok");
});

Deno.test("GA4 rows are parsed; landing query strings are stripped and merged", async () => {
  const { sa } = await serviceAccount();
  const { f } = fakeFetch((_u, init) => {
    const body = JSON.parse(String(init.body));
    if (body.dimensions.length === 2) return new Response(JSON.stringify({ rows: [{ dimensionValues: [{ value: "20261114" }, { value: "Organic Search" }], metricValues: [{ value: "12" }, { value: "10" }, { value: "7" }, { value: "2" }] }], propertyQuota: { tokensPerDay: { remaining: 199000 } } }));
    return new Response(JSON.stringify({ rows: [
      { dimensionValues: [{ value: "20261114" }, { value: "/da/pricing?email=a@b.dk" }, { value: "Organic Search" }], metricValues: [{ value: "3" }, { value: "2" }, { value: "0" }] },
      { dimensionValues: [{ value: "20261114" }, { value: "/da/pricing" }, { value: "Organic Search" }], metricValues: [{ value: "4" }, { value: "1" }, { value: "1" }] },
    ] }));
  });
  const g = new GoogleClient(sa, deps(f));
  const d = await ga4Daily(g, "1234567", "2026-11-14", "2026-11-14");
  assertEquals(d.rows, [{ day: "2026-11-14", channel_group: "Organic Search", sessions: 12, active_users: 10, engaged_sessions: 7, key_events: 2 }]);
  assertEquals(d.quotaRemaining, 199000);
  assertEquals(await ga4Landing(g, "1234567", "2026-11-14", "2026-11-14"), [{ day: "2026-11-14", landing_page: "/da/pricing", channel_group: "Organic Search", sessions: 7, engaged_sessions: 3, key_events: 1 }]);
});

Deno.test("403 is an access error (no retry); 429 then 200 succeeds; persistent 503 gives up", async () => {
  const { sa } = await serviceAccount();
  let n = 0;
  const forbidden = fakeFetch(() => { n++; return new Response("User does not have sufficient permissions", { status: 403 }); });
  await assertRejects(() => gscQueryPage(new GoogleClient(sa, deps(forbidden.f)), "sc-domain:x.dk", "a", "b"), GoogleAccessError);
  assertEquals(n, 1);
  let m = 0;
  const flaky = fakeFetch(() => (++m === 1 ? new Response("quota", { status: 429 }) : new Response(JSON.stringify({ rows: [{ keys: ["2026-11-10", "crm", "https://x.dk/"], clicks: 1, impressions: 10, ctr: 0.1, position: 4 }] }))));
  assertEquals((await gscQueryPage(new GoogleClient(sa, deps(flaky.f)), "sc-domain:x.dk", "a", "b")).length, 1);
  const down = fakeFetch(() => new Response("down", { status: 503 }));
  await assertRejects(() => gscQueryPage(new GoogleClient(sa, deps(down.f)), "sc-domain:x.dk", "a", "b"), GoogleUnavailableError, "gave up after 3");
});

Deno.test("Search Console site is URL-encoded into the path", async () => {
  const { sa } = await serviceAccount();
  const { f, calls } = fakeFetch(() => new Response(JSON.stringify({})));
  await gscQueryPage(new GoogleClient(sa, deps(f)), "sc-domain:aiagencydanmark.dk", "a", "b");
  assert(calls[1].url.endsWith("/sites/sc-domain%3Aaiagencydanmark.dk/searchAnalytics/query"));
});
