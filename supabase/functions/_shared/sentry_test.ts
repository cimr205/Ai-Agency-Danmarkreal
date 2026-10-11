// Run: deno test --allow-env --allow-net=127.0.0.1 supabase/functions/_shared/sentry_test.ts
//
// Drives the real wrapper against a local stand-in for Sentry's ingest
// endpoint and asserts both what is reported and what must never be.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";

const PORT = 48731;
const envelopes: string[] = [];
const ingest = Deno.serve({ port: PORT, hostname: "127.0.0.1", onListen: () => {} }, async (req) => {
  envelopes.push(`${new URL(req.url).pathname}\n${await req.text()}`);
  return new Response("{}", { status: 200 });
});

// The module reads its DSN at import time, so configure before importing.
Deno.env.set("SENTRY_DSN_EDGE", `http://testpublickey@127.0.0.1:${PORT}/42`);
Deno.env.set("SENTRY_ENVIRONMENT", "test");
const { withSentry, scrubString, parseDsn, parseStack, describeLogged, moduleForFunction } = await import("./sentry.ts");

// Assembled at runtime so no secret-shaped literal lives in the repo.
const SECRETS = {
  email: ["anna", "kunde.dk"].join("@"),
  jwt: ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"].join("."),
  stripeKey: ["sk", "live", "a1B2c3D4e5F6g7H8i9J0"].join("_"),
  accessToken: "ya29." + "A0ARrdaM-abcdefghijklmnopqrstuvwxyz",
  password: "hunter2-very-secret",
  body: "Fortroligt tilbud til kunden",
  query: "code=oauth-code-123",
};

async function settle(expected: number): Promise<Array<Record<string, any>>> {
  for (let i = 0; i < 100 && envelopes.length < expected; i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 60));
  const events = envelopes.map((raw) => JSON.parse(raw.split("\n")[3]));
  return events;
}

function assertNoSecrets() {
  const all = envelopes.join("\n");
  for (const [name, secret] of Object.entries(SECRETS)) {
    assert(!all.includes(secret), `${name} leaked into a Sentry envelope`);
  }
}

const req = (path = "/functions/v1/x") =>
  new Request(`http://localhost${path}?${SECRETS.query}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRETS.jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: SECRETS.password, body: SECRETS.body, to: SECRETS.email }),
  });

Deno.test("pure helpers", () => {
  assertEquals(parseDsn("https://abc@o1.ingest.de.sentry.io/123"), {
    envelopeUrl: "https://o1.ingest.de.sentry.io/api/123/envelope/",
    publicKey: "abc",
  });
  assertEquals(parseDsn("not a dsn"), null);
  assertEquals(scrubString(`mail ${SECRETS.email} key ${SECRETS.stripeKey}`), "mail [email] key [key]");
  assertEquals(scrubString("GET https://graph.facebook.com/v19.0/me?access_token=abc failed"), "GET https://graph.facebook.com/v19.0/me failed");
  assertEquals(moduleForFunction("stripe-payment-webhook"), "payments");
  assertEquals(moduleForFunction("gmail-sync"), "email_sync");
  assertEquals(moduleForFunction("process-campaign-email-jobs"), "bulk_email");
  assertEquals(moduleForFunction("meta-publish-campaign"), "meta_ads");
  assertEquals(moduleForFunction("smart-assistant"), "ai");
  const frames = parseStack("Error: x\n    at inner (file:///a/supabase/functions/gmail-send/index.ts:10:5)\n    at file:///a/supabase/functions/gmail-send/index.ts:20:3");
  assertEquals(frames.length, 2);
  assertEquals(frames[1], { function: "inner", filename: "functions/gmail-send/index.ts", lineno: 10, colno: 5, in_app: true });
});

Deno.test("console.error arguments that are not Errors are never serialised", () => {
  const event = describeLogged(["Token exchange error:", { access_token: SECRETS.accessToken, error: "invalid_grant" }]);
  assertEquals(event.message, "Token exchange error:");
  const withCode = describeLogged(["Upsert error:", { message: `duplicate key (email)=(${SECRETS.email})`, code: "23505", details: SECRETS.body }]);
  assertEquals(withCode.message, "Upsert error: duplicate key (email)=([email]) (23505)");
});

Deno.test("successful and 4xx responses are passed through and not reported", async () => {
  envelopes.length = 0;
  const ok = await withSentry("ok-fn", () => new Response("fine", { status: 200 }))(req());
  const bad = await withSentry("bad-fn", () => new Response(JSON.stringify({ error: "invoice_id is required" }), { status: 400 }))(req());
  const unauthorized = await withSentry("auth-fn", () => new Response("nope", { status: 401 }))(req());
  assertEquals([ok.status, bad.status, unauthorized.status], [200, 400, 401]);
  assertEquals(await ok.text(), "fine");
  assertEquals(await settle(0), []);
});

Deno.test("an unhandled exception is reported with a stack trace and re-thrown unchanged", async () => {
  envelopes.length = 0;
  const boom = new TypeError(`Cannot sync mailbox for ${SECRETS.email} with ${SECRETS.jwt}`);
  const handler = withSentry("gmail-sync", () => { throw boom; });
  const thrown = await assertRejects(() => Promise.resolve(handler(req("/functions/v1/gmail-sync"))));
  assert(thrown === boom, "the original error object must propagate");

  const [event] = await settle(1);
  assert(envelopes[0].startsWith("/api/42/envelope/"));
  assertEquals(event.level, "fatal");
  assertEquals(event.environment, "test");
  assertEquals(event.tags.function, "gmail-sync");
  assertEquals(event.tags.module, "email_sync");
  assertEquals(event.tags.kind, "unhandled");
  assertEquals(event.tags.background_job, "true");
  assertEquals(event.exception.values[0].type, "TypeError");
  assertEquals(event.exception.values[0].value, "Cannot sync mailbox for [email] with [jwt]");
  assert(event.exception.values[0].stacktrace.frames.length > 0, "stack trace expected");
  assertEquals(event.request, { method: "POST", url: "/functions/v1/gmail-sync" });
  assertNoSecrets();
});

Deno.test("a caught failure logged with console.error is reported; the 500 response is untouched", async () => {
  envelopes.length = 0;
  const handler = withSentry("stripe-payment-webhook", async () => {
    try {
      await Promise.resolve();
      throw new Error(`Invalid API Key provided: ${SECRETS.stripeKey}`);
    } catch (e) {
      console.error("stripe-payment-webhook error:", e, { payload: SECRETS.body, token: SECRETS.accessToken });
      return new Response(JSON.stringify({ error: "Payment registration failed" }), { status: 500 });
    }
  });
  const res = await handler(req());
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "Payment registration failed" });

  const events = await settle(1);
  assertEquals(events.length, 1, "logged error replaces the generic 5xx event");
  assertEquals(events[0].tags.kind, "logged");
  assertEquals(events[0].tags.module, "payments");
  assertEquals(events[0].tags.http_status, "500");
  assertEquals(events[0].exception.values[0].value, "stripe-payment-webhook error: Invalid API Key provided: [key]");
  assert(events[0].exception.values[0].stacktrace.frames.length > 0);
  assertNoSecrets();
});

Deno.test("a swallowed background-job failure (200 response) is still reported", async () => {
  envelopes.length = 0;
  const handler = withSentry("process-email-queue", async () => {
    await Promise.resolve();
    console.error("Email send failed", { queue: "transactional", msg_id: 7, error: { message: `550 mailbox ${SECRETS.email} unavailable` } });
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  });
  assertEquals((await handler(req())).status, 200);
  const events = await settle(1);
  assertEquals(events.length, 1);
  assertEquals(events[0].tags.background_job, "true");
  assertEquals(events[0].tags.http_status, "200");
  assertEquals(events[0].exception.values[0].value, "Email send failed");
  assertNoSecrets();
});

Deno.test("a silent 5xx is reported once", async () => {
  envelopes.length = 0;
  await withSentry("meta-sync", () => new Response("upstream down", { status: 502 }))(req());
  const events = await settle(1);
  assertEquals(events.length, 1);
  assertEquals(events[0].tags.kind, "http_5xx");
  assertEquals(events[0].exception.values[0].value, "meta-sync responded 502");
});

Deno.test("concurrent requests are attributed to their own function and capped", async () => {
  envelopes.length = 0;
  const slow = withSentry("gmail-send", async () => {
    await new Promise((r) => setTimeout(r, 30));
    console.error("Gmail send error:", 403);
    return new Response("x", { status: 502 });
  });
  const noisy = withSentry("lead-gen-api", async () => {
    for (let i = 0; i < 20; i++) console.error("Insert error:", new Error(`row ${i}`));
    await new Promise((r) => setTimeout(r, 10));
    return new Response("y", { status: 200 });
  });
  await Promise.all([slow(req()), noisy(req())]);
  const events = await settle(6);
  const byFn = (fn: string) => events.filter((e) => e.tags.function === fn);
  assertEquals(byFn("gmail-send").length, 1);
  assertEquals(byFn("gmail-send")[0].exception.values[0].value, "Gmail send error: 403");
  assertEquals(byFn("lead-gen-api").length, 5, "per-request cap");
});

Deno.test("a dead Sentry endpoint never affects the function", async () => {
  await ingest.shutdown();
  const res = await withSentry("gmail-send", () => {
    console.error("boom");
    return new Response("still works", { status: 500 });
  })(req());
  assertEquals(await res.text(), "still works");
  await new Promise((r) => setTimeout(r, 100));
});
