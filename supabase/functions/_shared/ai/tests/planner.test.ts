/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore-file no-explicit-any
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { registerCoreCapabilities } from "../capabilities/core-capabilities.ts";
import { validatePlan } from "../planning/plan-validator.ts";
import { PlanSchema } from "../planning/plan.schema.ts";
import type { ExecutionContext } from "../execution/execution.types.ts";

registerCoreCapabilities();

// Minimal chainable fake matching the subset of the Supabase query builder
// the core capabilities actually call — enough to drive plan-validator's
// connection-resolver checks without a live database.
function fakeDb(overrides: { emailAccountConnected?: boolean; composioConnected?: boolean } = {}) {
  const chain: any = {
    from(table: string) {
      return {
        select: () => chain.builder(table),
        insert: () => chain.builder(table),
        update: () => chain.builder(table),
        delete: () => chain.builder(table),
      };
    },
    builder(table: string) {
      const self: any = {
        eq: () => self,
        or: () => self,
        in: () => self,
        order: () => self,
        limit: () => self,
        gte: () => self,
        lte: () => self,
        neq: () => self,
        single: () => Promise.resolve({ data: null, error: null }),
        maybeSingle: () => {
          if (table === "email_accounts") return Promise.resolve({ data: overrides.emailAccountConnected ? { id: "acc1" } : null, error: null });
          if (table === "integrations") return Promise.resolve({ data: overrides.composioConnected ? { provider: "gmail" } : null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
      return self;
    },
  };
  return chain;
}

function ctxWith(overrides: { emailAccountConnected?: boolean; composioConnected?: boolean; roles?: string[] } = {}): ExecutionContext {
  return {
    db: fakeDb(overrides),
    workspaceId: "workspace-1",
    userId: "user-1",
    roles: (overrides.roles ?? ["employee"]) as any,
    authHeader: "Bearer test",
  };
}

// TEST 8: hallucinated capability (not among allowed candidates) → rejected.
Deno.test("plan-validator: rejects a capability the planner invented", async () => {
  const plan = PlanSchema.parse({
    language: "da", intent: "test", requiresClarification: false, clarificationQuestion: null,
    steps: [{ id: "step_1", capability: "facebook.send_email", input: {}, dependsOn: [] }],
  });
  const result = await validatePlan(plan, new Set(["email.send"]), ctxWith());
  assertEquals(result.ok, false);
  if (!result.ok) assert(/not offered|not registered/.test(result.reason));
});

// TEST 8b: capability that IS registered but was not among the candidates
// offered for this request — still rejected. Confidentiality/scope leak check.
Deno.test("plan-validator: rejects a real capability not offered as a candidate", async () => {
  const plan = PlanSchema.parse({
    language: "da", intent: "test", requiresClarification: false, clarificationQuestion: null,
    steps: [{ id: "step_1", capability: "crm.deals.update", input: { id: "550e8400-e29b-41d4-a716-446655440000" }, dependsOn: [] }],
  });
  const result = await validatePlan(plan, new Set(["email.send"]), ctxWith());
  assertEquals(result.ok, false);
});

// TEST 9: invalid tool arguments → schema validation failure.
Deno.test("plan-validator: rejects invalid input for a real, offered capability", async () => {
  const plan = PlanSchema.parse({
    language: "da", intent: "send_email", requiresClarification: false, clarificationQuestion: null,
    steps: [{ id: "step_1", capability: "email.send", input: { to: "not-an-email", subject: "", body: "hi" }, dependsOn: [] }],
  });
  const result = await validatePlan(plan, new Set(["email.send"]), ctxWith({ emailAccountConnected: true }));
  assertEquals(result.ok, false);
  if (!result.ok) assert(/Invalid input/.test(result.reason));
});

// Permission check: employee role cannot use crm.deals.update (manager-only).
Deno.test("plan-validator: rejects a step the user's role does not permit", async () => {
  const plan = PlanSchema.parse({
    language: "en", intent: "move_deal", requiresClarification: false, clarificationQuestion: null,
    steps: [{ id: "step_1", capability: "crm.deals.update", input: { id: "550e8400-e29b-41d4-a716-446655440000", stage: "won" }, dependsOn: [] }],
  });
  const result = await validatePlan(plan, new Set(["crm.deals.update"]), ctxWith({ roles: ["employee"] }));
  assertEquals(result.ok, false);
  if (!result.ok) assert(/permission/i.test(result.reason));
});

// TEST 3: no email provider connected → requires_connection, never a fake success.
Deno.test("plan-validator: email.send with no connected provider returns requires_connection", async () => {
  const plan = PlanSchema.parse({
    language: "en", intent: "send_email", requiresClarification: false, clarificationQuestion: null,
    steps: [{ id: "step_1", capability: "email.send", input: { to: "peter@example.com", subject: "Hi", body: "Hello" }, dependsOn: [] }],
  });
  const result = await validatePlan(plan, new Set(["email.send"]), ctxWith({ emailAccountConnected: false, composioConnected: false }));
  assertEquals(result.ok, false);
  if (!result.ok) {
    assert(result.requiresConnection, "should carry requiresConnection detail");
    assertEquals(result.requiresConnection!.capability, "email.send");
  }
});

Deno.test("plan-validator: email.send resolves via composio when only that is connected", async () => {
  const plan = PlanSchema.parse({
    language: "en", intent: "send_email", requiresClarification: false, clarificationQuestion: null,
    steps: [{ id: "step_1", capability: "email.send", input: { to: "peter@example.com", subject: "Hi", body: "Hello" }, dependsOn: [] }],
  });
  const result = await validatePlan(plan, new Set(["email.send"]), ctxWith({ emailAccountConnected: false, composioConnected: true }));
  assertEquals(result.ok, true);
});

Deno.test("plan-validator: rejects circular step dependencies", async () => {
  const plan = PlanSchema.parse({
    language: "en", intent: "test", requiresClarification: false, clarificationQuestion: null,
    steps: [
      { id: "step_1", capability: "crm.contacts.search", input: { query: "Peter" }, dependsOn: ["step_2"] },
      { id: "step_2", capability: "email.send", input: { to: "step_1", subject: "x", body: "y" }, dependsOn: ["step_1"] },
    ],
  });
  const result = await validatePlan(plan, new Set(["crm.contacts.search", "email.send"]), ctxWith());
  assertEquals(result.ok, false);
  if (!result.ok) assert(/[Cc]ircular/.test(result.reason));
});
