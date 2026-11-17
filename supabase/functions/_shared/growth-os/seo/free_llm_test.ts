import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFree, FreeModelCostError, pickFreeModels, RateLimitedError } from "./free-llm.ts";
import { type CatalogModel, type GatewayConfig, resetCatalogCache } from "../openrouter.ts";

const m = (id: string, price: number, created = 1, ctx = 128_000): CatalogModel => ({ id, promptUsdPerToken: price, completionUsdPerToken: price, contextLength: ctx, supportsJson: true, created });

Deno.test("pickFreeModels: never a paid model, preferred first, then newest free", () => {
  const cat = new Map([m("a:free", 0, 1), m("paid", 0.000001, 9), m("b:free", 0, 5), m("c:free", 0, 7), m("tiny:free", 0, 8, 4000)].map((x) => [x.id, x]));
  assertEquals(pickFreeModels(cat, ["paid", "a:free", "gone:free"]), ["a:free", "c:free", "b:free"]);
  assertEquals(pickFreeModels(new Map([["paid", m("paid", 1)]]), ["paid"]), []);
});

const cfg: GatewayConfig = { chatEndpoint: "https://or.test/v1/chat/completions", modelsEndpoint: "https://or.test/v1/models", apiKey: "k", classes: {}, complexProviders: [], complexFallback: null };
const catalog = { data: [
  { id: "x:free", pricing: { prompt: "0", completion: "0" }, context_length: 100000, created: 2 },
  { id: "y:free", pricing: { prompt: "0", completion: "0" }, context_length: 100000, created: 1 },
  { id: "paid/model", pricing: { prompt: "0.00001", completion: "0.00001" }, context_length: 100000, created: 3 },
] };

function fakeFetch(chat: (model: string) => Response) {
  const calls: string[] = [];
  const f = ((url: string | URL, init?: RequestInit) => {
    if (String(url).endsWith("/models")) return Promise.resolve(Response.json(catalog));
    const model = JSON.parse(String(init?.body)).model;
    calls.push(model);
    return Promise.resolve(chat(model));
  }) as typeof fetch;
  return { f, calls };
}
const call = { system: "s", user: "u", maxTokens: 10 };

Deno.test("callFree: falls through 429 to the next free model; paid model never called", async () => {
  resetCatalogCache();
  const { f, calls } = fakeFetch((model) => model === "x:free" ? new Response("", { status: 429 }) : Response.json({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 3, completion_tokens: 1, cost: 0 } }));
  const r = await callFree(cfg, ["x:free", "paid/model"], call, { fetch: f, now: () => 1 });
  assertEquals(r.model, "y:free");
  assertEquals(calls, ["x:free", "y:free"]);
  assert(!calls.includes("paid/model"));
});

Deno.test("callFree: all free models rate limited → RateLimitedError (task waits, no failed attempt)", async () => {
  resetCatalogCache();
  const { f } = fakeFetch(() => new Response("", { status: 429 }));
  await assertRejects(() => callFree(cfg, [], call, { fetch: f, now: () => 1 }), RateLimitedError);
});

Deno.test("callFree: a reported cost > 0 stops at once", async () => {
  resetCatalogCache();
  const { f, calls } = fakeFetch(() => Response.json({ choices: [{ message: { content: "{}" } }], usage: { cost: 0.002 } }));
  await assertRejects(() => callFree(cfg, [], call, { fetch: f, now: () => 1 }), FreeModelCostError);
  assertEquals(calls.length, 1);
});
