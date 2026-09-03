// deno-lint-ignore-file no-explicit-any
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { executePlan } from "../execution/execution-engine.ts";
import type { ValidatedStep } from "../planning/plan-validator.ts";
import type { Capability } from "../capabilities/capability.types.ts";
import { z } from "npm:zod@3.23.8";
import type { ExecutionContext } from "../execution/execution.types.ts";

const ctx: ExecutionContext = { db: {}, workspaceId: "w1", userId: "u1", roles: ["employee"] as any, authHeader: "Bearer x" };

function step(capability: Capability, id: string, input: Record<string, unknown>, dependsOn: string[] = []): ValidatedStep {
  return { step: { id, capability: capability.id, input, dependsOn }, capability, connection: { status: "resolved", provider: "native" } };
}

// TEST 10: executor fails → AI must never report success for that step.
Deno.test("execution-engine: a failed step is never reported as completed", async () => {
  const failing: Capability = {
    id: "test.fail", domain: "unknown", name: "Fails", description: "always fails",
    inputSchema: z.object({}), risk: "write", requiresConfirmation: false, requiredPermissions: ["employee"] as any, supportedProviders: ["native"],
    execute() { return Promise.resolve({ success: false, error: "Provider unavailable" }); },
  };
  const outcome = await executePlan([step(failing, "step_1", {})], ctx);
  assertEquals(outcome.status, "failed");
  assertEquals(outcome.records[0].status, "failed");
  assertEquals(outcome.records[0].error, "Provider unavailable");
});

// §AE partial success: task creation succeeds, then email send fails —
// must report partial, and the failed step must carry its real error.
Deno.test("execution-engine: partial success when a later step fails after an earlier one succeeds", async () => {
  const succeeds: Capability = {
    id: "tasks.create", domain: "tasks", name: "Create task", description: "creates a task",
    inputSchema: z.object({ title: z.string() }), risk: "write", requiresConfirmation: false, requiredPermissions: ["employee"] as any, supportedProviders: ["native"],
    execute(_c, input) { return Promise.resolve({ success: true, data: { id: "t1", title: (input as { title: string }).title } }); },
  };
  const fails: Capability = {
    id: "email.send", domain: "email", name: "Send email", description: "sends an email",
    inputSchema: z.object({ to: z.string() }), risk: "external_write", requiresConfirmation: false, requiredPermissions: ["employee"] as any, supportedProviders: ["native"],
    execute() { return Promise.resolve({ success: false, error: "SMTP unavailable" }); },
  };
  const outcome = await executePlan([step(succeeds, "step_1", { title: "Ring til Peter" }), step(fails, "step_2", { to: "peter@example.com" })], ctx);
  assertEquals(outcome.status, "partial");
  assertEquals(outcome.records[0].status, "completed");
  assertEquals(outcome.records[1].status, "failed");
});

Deno.test("execution-engine: resolves a step_N reference from a single-match prior result", async () => {
  const search: Capability = {
    id: "crm.contacts.search", domain: "crm", name: "Search", description: "search contacts",
    inputSchema: z.object({ query: z.string() }), risk: "read", requiresConfirmation: false, requiredPermissions: ["employee"] as any, supportedProviders: ["native"],
    execute() { return Promise.resolve({ success: true, data: [{ id: "c1", email: "peter@example.com", name: "Peter Jensen" }] }); },
  };
  const send: Capability = {
    id: "email.send", domain: "email", name: "Send", description: "send email",
    inputSchema: z.object({ to: z.string().email(), subject: z.string(), body: z.string() }), risk: "external_write", requiresConfirmation: false, requiredPermissions: ["employee"] as any, supportedProviders: ["native"],
    execute(_c, input) { return Promise.resolve({ success: true, data: input }); },
  };
  const outcome = await executePlan([
    step(search, "step_1", { query: "Peter" }),
    step(send, "step_2", { to: "step_1", subject: "Hej", body: "Test" }, ["step_1"]),
  ], ctx);
  assertEquals(outcome.status, "completed");
  assertEquals((outcome.records[1].output as { to: string }).to, "peter@example.com");
});

Deno.test("execution-engine: ambiguous step_N reference (multiple matches) triggers clarification, never a guess", async () => {
  const search: Capability = {
    id: "crm.contacts.search", domain: "crm", name: "Search", description: "search contacts",
    inputSchema: z.object({ query: z.string() }), risk: "read", requiresConfirmation: false, requiredPermissions: ["employee"] as any, supportedProviders: ["native"],
    execute() { return Promise.resolve({ success: true, data: [{ id: "c1", email: "peter1@example.com" }, { id: "c2", email: "peter2@example.com" }] }); },
  };
  const send: Capability = {
    id: "email.send", domain: "email", name: "Send", description: "send email",
    inputSchema: z.object({ to: z.string().email() }), risk: "external_write", requiresConfirmation: false, requiredPermissions: ["employee"] as any, supportedProviders: ["native"],
    execute(_c, input) { return Promise.resolve({ success: true, data: input }); },
  };
  const outcome = await executePlan([
    step(search, "step_1", { query: "Peter" }),
    step(send, "step_2", { to: "step_1" }, ["step_1"]),
  ], ctx);
  assertEquals(outcome.status, "requires_clarification");
});

Deno.test("execution-engine: stops at a step requiring confirmation without executing it", async () => {
  const needsConfirmation: Capability = {
    id: "email.send", domain: "email", name: "Send", description: "send email",
    inputSchema: z.object({ to: z.string() }), risk: "external_write", requiresConfirmation: true, requiredPermissions: ["employee"] as any, supportedProviders: ["native"],
    execute() { throw new Error("should never be called without confirmation"); },
  };
  const outcome = await executePlan([step(needsConfirmation, "step_1", { to: "peter@example.com" })], ctx);
  assertEquals(outcome.status, "requires_confirmation");
  assertEquals(outcome.records.length, 0);
});

Deno.test("execution-engine: confirmed step id allows execution to proceed", async () => {
  let called = false;
  const nowConfirmed: Capability = {
    id: "email.send", domain: "email", name: "Send", description: "send email",
    inputSchema: z.object({ to: z.string() }), risk: "external_write", requiresConfirmation: true, requiredPermissions: ["employee"] as any, supportedProviders: ["native"],
    execute() { called = true; return Promise.resolve({ success: true, data: {} }); },
  };
  const outcome = await executePlan([step(nowConfirmed, "step_1", { to: "peter@example.com" })], ctx, new Set(["step_1"]));
  assert(called);
  assertEquals(outcome.status, "completed");
});
