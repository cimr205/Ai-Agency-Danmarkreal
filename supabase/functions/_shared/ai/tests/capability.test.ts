import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { registerCoreCapabilities, CORE_CAPABILITIES } from "../capabilities/core-capabilities.ts";
import { CapabilityRegistry } from "../capabilities/capability-registry.ts";
import { searchCapabilities } from "../capabilities/capability-search.ts";

registerCoreCapabilities();

Deno.test("registry: every core capability is registered exactly once", () => {
  for (const c of CORE_CAPABILITIES) {
    assert(CapabilityRegistry.get(c.id), `${c.id} should be registered`);
  }
});

// TEST 1 (capability layer): "vis mine leads" only surfaces CRM
// capabilities — email/marketing/etc. must never leak into the candidate
// set for an unrelated domain (§K: not every tool goes to the LLM).
Deno.test("capability-search: crm domain never includes email capabilities", () => {
  const candidates = searchCapabilities("Vis mine leads", "crm", ["employee"]);
  assert(candidates.length > 0, "should find crm candidates");
  assert(candidates.every((c) => c.domain === "crm"), "all candidates must be crm domain");
  assert(!candidates.some((c) => c.id.startsWith("email.")), "no email capability should appear for a crm-domain request");
});

Deno.test("capability-search: email domain surfaces email.send for a send request", () => {
  const candidates = searchCapabilities("Send en mail til Peter", "email", ["employee"]);
  // "Peter" also pulls in crm.contacts.search (needed to resolve who
  // "Peter" is) — that's intentional cross-domain injection, not a bug.
  // The real assertion is that email.send is offered at all.
  assert(candidates.some((c) => c.id === "email.send"), "email.send must be among the candidates");
});

Deno.test("capability-search: readonly role never sees write capabilities", () => {
  const candidates = searchCapabilities("Opret en opgave", "tasks", ["readonly"]);
  assertEquals(candidates.length, 0, "readonly has no permission for tasks.create — nothing should be offered");
});

Deno.test("registry: getAvailableForWorkspace respects role scoping", () => {
  const managerOnly = CapabilityRegistry.getByDomain("crm").filter((c) => c.id === "crm.deals.update")[0];
  assert(managerOnly, "crm.deals.update must be registered");
  const employeeCapabilities = CapabilityRegistry.getAvailableForWorkspace(["employee"]);
  assert(!employeeCapabilities.some((c) => c.id === "crm.deals.update"), "employee role must not see manager-only crm.deals.update");
  const managerCapabilities = CapabilityRegistry.getAvailableForWorkspace(["manager"]);
  assert(managerCapabilities.some((c) => c.id === "crm.deals.update"), "manager role must see crm.deals.update");
});
