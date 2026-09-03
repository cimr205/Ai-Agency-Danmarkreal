// Unit tests for the pure, DB-free logic in the Action Registry / Approval
// Engine: permission checks, field validation, action-name aliasing.
//
// NOT covered here (require a live Supabase project + auth, no such
// harness exists in this repo yet): cross-tenant rejection, double-approve
// idempotency (claim_ai_action_execution), edit-before-approve audit trail,
// retry-after-failure, signal deduplication, tenant-scoped context
// retrieval. Those are exercised manually in this session (curl against
// the deployed function) but not automated — a real gap, see the report.
//
// Run with: deno test --allow-none supabase/functions/ai-operating-manager/index.test.ts
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ACTIONS, canExecute, canonicalAction, validateField, validateInput } from "./actionRegistry.ts";

Deno.test("canExecute: permission required to run an action (§10)", () => {
  const def = ACTIONS["crm.deal.move_stage"]; // MANAGER_ROLES only
  assertEquals(canExecute(def, ["employee"]), false, "an employee must not be able to move a deal stage");
  assertEquals(canExecute(def, ["manager"]), true);
  assertEquals(canExecute(def, ["company_admin"]), true);
});

Deno.test("canExecute: low-risk action allows regular members", () => {
  const def = ACTIONS["tasks.create"];
  assertEquals(canExecute(def, ["employee"]), true);
  assertEquals(canExecute(def, ["readonly"]), false);
});

Deno.test("canonicalAction: resolves legacy/loose names to registered actions", () => {
  assertEquals(canonicalAction("create_task"), "tasks.create");
  assertEquals(canonicalAction("update_lead_status"), "crm.lead.move_stage");
  // an unrecognized name passes through unchanged so the caller's own
  // "not registered" check (not this function) is the single source of truth
  assertEquals(canonicalAction("totally_made_up_action"), "totally_made_up_action");
});

Deno.test("validateField: uuid/email/date/datetime/number/object all reject malformed AI output (§16)", () => {
  assertEquals(validateField("id", "uuid", "not-a-uuid"), "id er ikke et gyldigt id");
  assertEquals(validateField("id", "uuid", "550e8400-e29b-41d4-a716-446655440000"), null);
  assertEquals(validateField("email", "email", "not-an-email"), "email er ikke en gyldig email");
  assertEquals(validateField("email", "email", "a@b.dk"), null);
  assertEquals(validateField("due_date", "date", "not-a-date"), "due_date er ikke en gyldig dato");
  assertEquals(validateField("start_time", "datetime", "not-a-datetime"), "start_time er ikke et gyldigt tidspunkt");
  assertEquals(validateField("amount", "number", "12"), "amount skal være et tal");
  assertEquals(validateField("amount", "number", 12), null);
  assertEquals(validateField("arguments", "object", []), "arguments skal være et objekt");
  assertEquals(validateField("arguments", "object", { a: 1 }), null);
  assertEquals(validateField("title", "string", ""), "title skal være udfyldt");
});

Deno.test("validateInput: rejects unknown fields — the model can't smuggle extra payload through", () => {
  const def = ACTIONS["tasks.create"];
  assertThrows(
    () => validateInput(def, { title: "Follow up", not_a_real_field: "x" }),
    Error,
    "Ukendte felter",
  );
});

Deno.test("validateInput: missing required field is rejected (never executes malformed data)", () => {
  const def = ACTIONS["crm.customer.create"]; // requires name + email
  assertThrows(() => validateInput(def, { name: "Acme ApS" }), Error, "email");
});

Deno.test("validateInput: non-object input is rejected", () => {
  const def = ACTIONS["tasks.create"];
  assertThrows(() => validateInput(def, "not an object"), Error, "objekt");
});

Deno.test("validateInput: accepts a fully valid payload for every registered action's minimal shape", () => {
  const samples: Record<string, unknown> = {
    "tasks.create": { title: "Follow up" },
    "crm.customer.create": { name: "Acme ApS", email: "kontakt@acme.dk" },
    "crm.lead.create": { name: "Acme ApS", email: "kontakt@acme.dk" },
    "crm.lead.move_stage": { lead_id: "550e8400-e29b-41d4-a716-446655440000", status: "contacted" },
    "crm.deal.move_stage": { deal_id: "550e8400-e29b-41d4-a716-446655440000", stage: "won" },
    "calendar.event.create": { title: "Møde", start_time: "2026-09-10T10:00:00Z", end_time: "2026-09-10T10:30:00Z" },
    "invoice.create": { customer_id: "550e8400-e29b-41d4-a716-446655440000", amount: 1000 },
    "email.send": { to: "kunde@firma.dk", subject: "Hej", body: "Tekst" },
    "integration.tool.execute": { integration_id: "550e8400-e29b-41d4-a716-446655440000", tool_slug: "GMAIL_SEND", action_category: "communication", arguments: {} },
  };
  for (const [name, input] of Object.entries(samples)) {
    const def = ACTIONS[name];
    validateInput(def, input); // throws on failure — test fails loudly if any action's own sample is invalid
  }
});
