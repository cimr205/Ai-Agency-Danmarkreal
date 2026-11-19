import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AGENT_PROFILES, DEPARTMENTS, EXTERNAL_SKILLS, SKILLS, SPECIALISTS } from "./registry/index.ts";
import { validateRegistry } from "./validate.ts";
import { actionLevel, payloadHash, requiredApprover } from "./approval.ts";

Deno.test("registry: 35 specialists, 35 verifiers, 5 department CEOs, 1 global CEO", () => {
  assertEquals(SPECIALISTS.length, 35);
  assertEquals(new Set(SPECIALISTS.map((s) => s.number)).size, 35);
  const by = (k: string) => AGENT_PROFILES.filter((p) => p.kind === k).length;
  assertEquals(by("specialist"), 35);
  assertEquals(by("verifier"), 35);
  assertEquals(by("department_ceo"), 5);
  assertEquals(by("global_ceo"), 1);
  assertEquals(DEPARTMENTS.length, 5);
});

Deno.test("registry validates (skills, verifiers, actions, budgets)", () => {
  const r = validateRegistry(AGENT_PROFILES, SKILLS, EXTERNAL_SKILLS.map((e) => e.id));
  assertEquals(r.errors, []);
});

Deno.test("every specialist has a skill contract per assigned skill; only SEO is operational", () => {
  for (const sp of SPECIALISTS) {
    for (const s of sp.skills) assert(SKILLS.some((k) => k.id === s && k.agentId === sp.id), `${sp.id} ${s}`);
  }
  assertEquals(SPECIALISTS.filter((s) => s.status === "operational").map((s) => s.id), ["seo-agent"]);
  assertEquals(SKILLS.filter((s) => s.status === "active").map((s) => s.id).sort(), ["onpage-seo-audit", "search-console-analysis", "seo-autopilot", "seo-experiment-verification"]);
});

Deno.test("external skills are pinned to full commit SHAs", () => {
  for (const e of EXTERNAL_SKILLS) assert(/^[0-9a-f]{40}$/.test(e.commit), e.id);
  assert(EXTERNAL_SKILLS.some((e) => e.status === "blocked"));
});

Deno.test("approval levels: unknown actions are Level 3 and need a human", async () => {
  assertEquals(actionLevel("something.new"), 3);
  assertEquals(requiredApprover(actionLevel("deploy.production")), "human");
  assertEquals(requiredApprover(actionLevel("analyze")), "none");
  assertEquals(await payloadHash("a", { b: 1, a: 2 }), await payloadHash("a", { a: 2, b: 1 }));
  assert(await payloadHash("a", { a: 1 }) !== await payloadHash("a", { a: 2 }));
});
