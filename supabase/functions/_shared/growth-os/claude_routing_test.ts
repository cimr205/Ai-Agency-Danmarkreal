import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callModel, DEFAULT_ADVANCED, eligibleModels, gatewayConfigFromEnv, resetCatalogCache, resolveEntry, type CatalogModel } from "./openrouter.ts";
import { AGENT_PROFILES } from "./registry/index.ts";
import { MemoryStore } from "./memory-store.ts";

// Owner decision 2026-11-14: hard (complex) tasks run on Claude. Model ids below are
// made up for the test; the real ones come from OpenRouter's live catalogue.
const m = (id: string, created: number, prompt = 0.000003, completion = 0.000015): CatalogModel =>
  ({ id, created, promptUsdPerToken: prompt, completionUsdPerToken: completion, contextLength: 200000, supportsJson: true });
const catalog = new Map([
  m("anthropic/claude-sonnet-old", 100), m("anthropic/claude-sonnet-new", 300), m("anthropic/claude-sonnet-new:beta", 400),
  m("anthropic/claude-opus-new", 250, 0.000015, 0.000075), m("anthropic/claude-haiku-new", 300, 0.000001, 0.000005),
  m("cheapco/fast", 500, 0.0000001, 0.0000002), m("openai/big", 500, 0.000002, 0.000008),
].map((x) => [x.id, x]));

const env = (extra: Record<string, string> = {}) => gatewayConfigFromEnv((k) => ({ LOCAL_LLM_BASE_URL: "https://openrouter.ai/api/v1", LOCAL_LLM_MODEL: "cheapco/fast", LOCAL_LLM_API_KEY: "k", ...extra })[k]);

Deno.test("default policy: complex tasks get the newest Claude Sonnet, then the newest Opus; never a cheaper non-Claude model", () => {
  const cfg = env()!;
  assertEquals(cfg.classes.advanced, DEFAULT_ADVANCED);
  assertEquals(cfg.complexProviders, ["anthropic"]);
  const ids = eligibleModels(cfg, catalog, "complex", 1000, 500, 1, true).map((e) => e.model.id);
  assertEquals(ids, ["anthropic/claude-sonnet-new", "anthropic/claude-opus-new"]);
});

Deno.test("simple and standard tasks still use the cheapest allowed model", () => {
  const cfg = env()!;
  assertEquals(eligibleModels(cfg, catalog, "standard", 1000, 500, 1, true)[0].model.id, "cheapco/fast");
});

Deno.test("an owner policy that puts a non-Claude model in 'advanced' cannot route complex tasks to it", () => {
  const cfg = env({ GROWTH_OS_MODEL_CLASSES: JSON.stringify({ standard: ["cheapco/fast"], advanced: ["openai/big", "anthropic/claude-opus-*"] }) })!;
  assertEquals(eligibleModels(cfg, catalog, "complex", 1000, 500, 1, true).map((e) => e.model.id), ["anthropic/claude-opus-new"]);
});

Deno.test("complex tasks are BLOCKED when no Claude model fits (catalogue or per-call cost cap)", async () => {
  const cfg = env()!;
  assertEquals(eligibleModels(cfg, new Map([["openai/big", catalog.get("openai/big")!]]), "complex", 1000, 500, 1, true).length, 0);
  assertEquals(eligibleModels(cfg, catalog, "complex", 1000, 500, 0.0001, true).length, 0);
  resetCatalogCache();
  let chatCalls = 0;
  const f = ((u: string) => {
    if (u.endsWith("/models")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "openai/big", created: 1, pricing: { prompt: "0.000002", completion: "0.000008" }, context_length: 1e5, supported_parameters: ["response_format"] }] })));
    chatCalls++;
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  const store = new MemoryStore(1);
  const r = await callModel(cfg, { purpose: "t", complexity: "complex", system: "s", user: "u", maxTokens: 100, maxUsdPerCall: 0.05, denyDataCollection: true },
    { fetch: f, now: () => 0, sleep: () => Promise.resolve(), newId: () => "r", onUsage: () => {}, ledger: store.ledger({ id: "x", companyId: "c", agentId: "a", type: "t", input: {}, budgetUsd: 1 }) });
  assert(!r.ok && r.reason === "blocked" && r.detail.includes("anthropic"));
  assertEquals(chatCalls, 0);
});

Deno.test("pattern resolution ignores :beta/:free variants and older versions", () => {
  assertEquals(resolveEntry("anthropic/claude-sonnet-*", catalog)?.id, "anthropic/claude-sonnet-new");
  assertEquals(resolveEntry("anthropic/claude-nothing-*", catalog), undefined);
});

Deno.test("CEO agents (the hard tasks) plan and execute at complex / standard+ policy", () => {
  for (const p of AGENT_PROFILES.filter((x) => x.kind === "department_ceo" || x.kind === "global_ceo")) assertEquals(p.modelPolicy.execute, "complex");
});

// Owner decision 2026-11-14 (2): if Claude is not there, use the Ollama instance on Railway.
const OLLAMA = { GROWTH_OS_OLLAMA_BASE_URL: "https://ollama-test.up.railway.app", GROWTH_OS_OLLAMA_MODEL: "qwen-test" };

function fakeOpenRouter(catalogData: unknown[], onChat: (url: string, body: Record<string, unknown>) => Response) {
  return ((u: string, init?: RequestInit) => {
    if (u.endsWith("/models")) return Promise.resolve(new Response(JSON.stringify({ data: catalogData })));
    return Promise.resolve(onChat(u, JSON.parse(String(init!.body))));
  }) as typeof fetch;
}
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
const run = (cfg: ReturnType<typeof env>, f: typeof fetch, usage: { model: string; status: string; actualUsd: number | null }[] = []) =>
  callModel(cfg!, { purpose: "ceo", complexity: "complex", system: "s", user: "u", maxTokens: 100, maxUsdPerCall: 0.05, denyDataCollection: true },
    { fetch: f, now: () => 0, sleep: () => Promise.resolve(), newId: () => "r", onUsage: (u) => { usage.push(u); }, ledger: new MemoryStore(1).ledger({ id: "x", companyId: "c", agentId: "a", type: "t", input: {}, budgetUsd: 1 }) });

Deno.test("Ollama fallback: only https endpoints are accepted", () => {
  assertEquals(env(OLLAMA)!.complexFallback?.chatEndpoint, "https://ollama-test.up.railway.app/v1/chat/completions");
  assertEquals(env({ ...OLLAMA, GROWTH_OS_OLLAMA_BASE_URL: "http://ollama.railway.internal:11434" })!.complexFallback, null);
  assertEquals(env()!.complexFallback, null);
});

Deno.test("Claude available: complex tasks use Claude and never touch Ollama", async () => {
  resetCatalogCache();
  const hosts: string[] = [];
  const f = fakeOpenRouter([{ id: "anthropic/claude-sonnet-x", created: 1, pricing: { prompt: "0.000003", completion: "0.000015" }, context_length: 2e5, supported_parameters: ["response_format"] }],
    (u) => { hosts.push(new URL(u).host); return ok("svar"); });
  const r = await run(env(OLLAMA), f);
  assert(r.ok);
  assertEquals(r.model, "anthropic/claude-sonnet-x");
  assertEquals(hosts, ["openrouter.ai"]);
});

Deno.test("no Claude in the catalogue: complex tasks go to Ollama on Railway (not to another OpenRouter model)", async () => {
  resetCatalogCache();
  const calls: { host: string; body: Record<string, unknown> }[] = [];
  const f = fakeOpenRouter([{ id: "openai/big", created: 1, pricing: { prompt: "0.000002", completion: "0.000008" }, context_length: 1e5, supported_parameters: ["response_format"] }],
    (u, body) => { calls.push({ host: new URL(u).host, body }); return ok("svar fra ollama"); });
  const usage: { model: string; status: string; actualUsd: number | null }[] = [];
  const r = await run(env(OLLAMA), f, usage);
  assert(r.ok);
  assertEquals(r.model, "ollama/qwen-test");
  assertEquals(calls.map((c) => c.host), ["ollama-test.up.railway.app"]);
  assertEquals(calls[0].body.model, "qwen-test");
  assertEquals(calls[0].body.reasoning_effort, "none");
  assertEquals(calls[0].body.provider, undefined); // OpenRouter-only fields are not sent to Ollama
  assertEquals(usage[0].actualUsd, 0);
});

Deno.test("Claude fails (5xx): falls back to Ollama after the retries", async () => {
  resetCatalogCache();
  const hosts: string[] = [];
  const f = fakeOpenRouter([{ id: "anthropic/claude-sonnet-x", created: 1, pricing: { prompt: "0.000003", completion: "0.000015" }, context_length: 2e5, supported_parameters: ["response_format"] }],
    (u) => { const h = new URL(u).host; hosts.push(h); return h === "openrouter.ai" ? new Response("{}", { status: 503 }) : ok("ok"); });
  const r = await run(env(OLLAMA), f);
  assert(r.ok);
  assertEquals(r.model, "ollama/qwen-test");
  assertEquals(hosts, ["openrouter.ai", "openrouter.ai", "openrouter.ai", "ollama-test.up.railway.app"]);
});

Deno.test("OpenRouter down entirely: complex tasks still reach Ollama; simple tasks do not", async () => {
  resetCatalogCache();
  const f = ((u: string) => u.endsWith("/models") ? Promise.resolve(new Response("down", { status: 502 })) : Promise.resolve(ok("ok"))) as typeof fetch;
  const r = await run(env(OLLAMA), f);
  assert(r.ok && r.model === "ollama/qwen-test");
  resetCatalogCache();
  const simple = await callModel(env(OLLAMA)!, { purpose: "t", complexity: "simple", system: "s", user: "u", maxTokens: 10, maxUsdPerCall: 0.01, denyDataCollection: true },
    { fetch: f, now: () => 0, sleep: () => Promise.resolve(), newId: () => "r", onUsage: () => {}, ledger: new MemoryStore(1).ledger({ id: "x", companyId: "c", agentId: "a", type: "t", input: {}, budgetUsd: 1 }) });
  assert(!simple.ok);
});
