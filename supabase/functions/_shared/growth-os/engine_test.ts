import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runTask, type GrowthTask } from "./engine.ts";
import { MemoryStore } from "./memory-store.ts";
import { callModel, eligibleModels, resetCatalogCache, type GatewayConfig } from "./openrouter.ts";
import { auditHtml, auditScore, isPublicHttpUrl } from "./seo/onpage.ts";
import { validateAgentReport } from "./validate.ts";

const GOOD = await Deno.readTextFile(new URL("./fixtures/seo/good.html", import.meta.url));
const BAD = await Deno.readTextFile(new URL("./fixtures/seo/bad.html", import.meta.url));

const CATALOG = {
  data: [
    { id: "cheap/std", pricing: { prompt: "0.0000001", completion: "0.0000004" }, context_length: 100000, supported_parameters: ["response_format"] },
    { id: "pricey/adv", pricing: { prompt: "0.00001", completion: "0.00003" }, context_length: 100000, supported_parameters: ["response_format"] },
    { id: "nojson/std", pricing: { prompt: "0", completion: "0" }, context_length: 100000, supported_parameters: [] },
  ],
};
const CFG: GatewayConfig = { chatEndpoint: "https://or.test/api/v1/chat/completions", modelsEndpoint: "https://or.test/api/v1/models", apiKey: "test", classes: { standard: ["nojson/std", "cheap/std"], advanced: ["pricey/adv"] }, complexProviders: ["anthropic"], complexFallback: null };

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
function fakeFetch(pages: Record<string, string | Response>, chat: Handler): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit): Promise<Response> => Promise.resolve(route(input, init))) as typeof fetch;
  function route(input: string | URL | Request, init?: RequestInit): Response | Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === CFG.modelsEndpoint) return new Response(JSON.stringify(CATALOG), { status: 200 });
    if (url === CFG.chatEndpoint) return chat(url, init);
    const p = pages[url];
    if (p === undefined) return new Response("nf", { status: 404, headers: { "content-type": "text/html" } });
    return typeof p === "string" ? new Response(p, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }) : p;
  }
}
const okChat = (recs: unknown[], cost = 0.00012): Handler => () =>
  new Response(JSON.stringify({ id: "gen-1", model: "cheap/std", choices: [{ message: { content: JSON.stringify({ recommendations: recs }) } }], usage: { prompt_tokens: 300, completion_tokens: 80, cost } }), { status: 200 });

let n = 0;
const deps = (store: MemoryStore, f: typeof fetch, gateway: GatewayConfig | null = CFG) => ({ store, gateway, fetch: f, now: () => 1_700_000_000_000 + n++, sleep: () => Promise.resolve(), newId: () => `id-${n++}` });
const task = (url: string, budgetUsd = 0.05): GrowthTask => ({ id: `t-${n++}`, companyId: "c1", agentId: "seo-agent", type: "seo.onpage_audit", input: { url, objective: "Audit the pricing page" }, budgetUsd });

Deno.test("onpage checks are deterministic on fixtures", () => {
  const g = auditHtml(GOOD, "https://example.dk/pricing");
  assertEquals(g.filter((c) => c.status !== "pass").map((c) => c.id), []);
  assertEquals(auditScore(g), 1);
  const b = auditHtml(BAD, "https://example.dk/");
  const failing = b.filter((c) => c.status === "fail").map((c) => c.id).sort();
  assertEquals(failing, ["h1_count", "html_lang", "img_alt_coverage", "indexable", "internal_links", "meta_description", "open_graph", "viewport", "word_count"]);
  assert(auditScore(b) < 0.5);
});

Deno.test("SSRF guard refuses private and metadata hosts", () => {
  for (const u of ["http://localhost/", "http://127.0.0.1/", "http://169.254.169.254/latest", "http://10.0.0.1/", "http://192.168.1.1/", "http://[::1]/", "http://router/", "ftp://example.dk/", "https://example.dk:8443/", "https://u:p@example.dk/"]) {
    assert(!isPublicHttpUrl(u).ok, u);
  }
  assert(isPublicHttpUrl("https://aiagencydanmark.dk/").ok);
});

Deno.test("end-to-end SEO task: execute, verify, learn, report, CEO", async () => {
  resetCatalogCache();
  const store = new MemoryStore();
  store.scores.set("c1|seo-agent|https://example.dk/", 0.4);
  const r = await runTask(task("https://example.dk/"), deps(store, fakeFetch({ "https://example.dk/": BAD }, okChat([{ check_id: "meta_description", fix: "Add a 120-character description of the offer.", impact: "high" }]))));
  assertEquals(r.report.status, "completed");
  assertEquals(r.verification.status, "verified");
  assertEquals(r.report.model_used, "cheap/std"); // cheapest JSON-capable standard model from the live catalogue
  assertEquals(r.report.cost.actual_usd, 0.00012);
  assertEquals(r.report.cost.tokens, 380);
  assertEquals(validateAgentReport(r.report).errors, []);
  assertEquals(r.ceo.ceoId, "ceo-search");
  assertEquals(r.ceo.decision, "needs_human"); // score < 0.5
  assertEquals(r.learning.outcome, "new_learning"); // 0.4 → new score
  for (const phase of ["observe", "plan", "execute", "verify", "evaluate", "learn", "report", "ceo"]) assert(store.events.some((e) => e.phase === phase), phase);
  assertEquals(store.reports.map((x) => x.kind).sort(), ["agent", "ceo", "verification"]);
  assertEquals(store.usages.length, 1);
});

Deno.test("verifier catches an invented recommendation (model output outside failing checks is rejected)", async () => {
  resetCatalogCache();
  const store = new MemoryStore();
  let calls = 0;
  const chat: Handler = () => { calls++; return okChat([{ check_id: "external_links", fix: "x", impact: "high" }])("", undefined); };
  const r = await runTask(task("https://example.dk/"), deps(store, fakeFetch({ "https://example.dk/": BAD }, chat)));
  // 2 attempts on the cheap model, then 2 on the advanced fallback; every invalid answer is refused,
  // so no invented recommendation reaches the report
  assertEquals(calls, 4);
  assertEquals(store.usages.filter((u) => u.status === "invalid_output").length, 4);
  assertEquals(r.learning.outcome, "improvement_proposed");
  assert(r.learning.proposedChange);
  assertEquals(r.report.model_used, null);
});

Deno.test("a page that changes between fetches is inconclusive, never verified", async () => {
  resetCatalogCache();
  const store = new MemoryStore();
  let i = 0;
  const f = fakeFetch({}, okChat([]));
  const flip: typeof fetch = ((input: string, init?: RequestInit) => input === "https://example.dk/x"
    ? Promise.resolve(new Response(i++ === 0 ? GOOD : BAD, { status: 200, headers: { "content-type": "text/html" } }))
    : f(input, init)) as typeof fetch;
  const r = await runTask(task("https://example.dk/x"), deps(store, flip, null));
  assertEquals(r.verification.status, "inconclusive");
  assertEquals(r.report.status, "inconclusive");
});

Deno.test("without a gateway the task still completes with checks only, cost 0", async () => {
  resetCatalogCache();
  const store = new MemoryStore();
  const r = await runTask(task("https://example.dk/pricing"), deps(store, fakeFetch({ "https://example.dk/pricing": GOOD }, okChat([])), null));
  assertEquals(r.report.status, "completed");
  assertEquals(r.report.cost.actual_usd, 0);
  assertEquals(r.ceo.decision, "accept");
});

Deno.test("budget: gateway refuses before calling when the worst case exceeds the task budget", async () => {
  resetCatalogCache();
  const store = new MemoryStore();
  let calls = 0;
  await runTask(task("https://example.dk/", 0.0000001), deps(store, fakeFetch({ "https://example.dk/": BAD }, () => { calls++; return new Response("{}"); })));
  assertEquals(calls, 0);
  assert(store.usages.some((u) => u.status === "refused_budget"));
  assert(store.events.some((e) => e.action === "llm.recommend" && e.status === "blocked"));
});

Deno.test("gateway: retries 429 with backoff, then falls back within policy", async () => {
  resetCatalogCache();
  const sleeps: number[] = [];
  let calls = 0;
  const f = fakeFetch({}, (_u, init) => {
    calls++;
    const model = JSON.parse(String(init!.body)).model;
    assertEquals(JSON.parse(String(init!.body)).provider, { data_collection: "deny" });
    return model === "cheap/std" ? new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }) : okChat([])("", undefined);
  });
  const store = new MemoryStore(10);
  const res = await callModel({ ...CFG, classes: { standard: ["cheap/std"], advanced: ["pricey/adv"] } }, { purpose: "t", complexity: "standard", system: "s", user: "u", maxTokens: 50, maxUsdPerCall: 0.01, denyDataCollection: true }, { fetch: f, now: () => 0, sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); }, newId: () => "r", onUsage: () => {}, ledger: store.ledger({ id: "x", companyId: "c", agentId: "a", type: "t", input: {}, budgetUsd: 1 }) });
  assert(res.ok);
  assertEquals(calls, 4);
  assertEquals(sleeps, [500, 1000]);
});

Deno.test("gateway: complex tasks are BLOCKED when no advanced model is configured (no silent downgrade)", () => {
  const catalog = new Map([["cheap/std", { id: "cheap/std", promptUsdPerToken: 0, completionUsdPerToken: 0, contextLength: 1e5, supportsJson: true, created: 0 }]]);
  assertEquals(eligibleModels({ ...CFG, classes: { standard: ["cheap/std"] } }, catalog, "complex", 100, 100, 1, false).length, 0);
  assertEquals(eligibleModels({ ...CFG, classes: { standard: ["gone/model"] } }, catalog, "standard", 100, 100, 1, false).length, 0); // not in live catalogue
});

Deno.test("unregistered executors are refused, not faked", async () => {
  const store = new MemoryStore();
  await assertRejects(() => runTask({ ...task("https://example.dk/"), agentId: "cro-agent", type: "cro.audit" }, deps(store, fakeFetch({}, okChat([])))), Error, "no executor");
});
