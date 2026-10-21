import { test, expect } from "@playwright/test";
import { loadTenants, signIn, callOperatingManager, serviceSelect } from "../support/testProject.ts";
import { createServiceClient } from "../../src/mastra/e2e/supabase-port.ts";

test.describe("crm.lead.update", () => {
  let jwtA: string;
  let jwtB: string;
  let leadId: string;
  let foreignLeadId: string;
  let customerId: string;

  async function propose(jwt: string, input: Record<string, unknown>, key = crypto.randomUUID()) {
    return callOperatingManager(jwt, { operation: "propose", actionName: "crm.lead.update", input, idempotencyKey: key });
  }

  async function create(jwt: string, actionName: string) {
    const proposal = await callOperatingManager(jwt, {
      operation: "propose", actionName, input: { name: "e2e-qa B4", email: "e2e-qa-b4@e2e.aiagencydk.test" }, idempotencyKey: crypto.randomUUID(),
    });
    expect(proposal.status).toBe(201);
    const result = await callOperatingManager(jwt, { operation: "approve", actionId: proposal.json.action.id });
    expect(result.status).toBe(200);
    return result.json.result.id as string;
  }

  test.beforeAll(async () => {
    const { tenants, password } = loadTenants();
    jwtA = await signIn(tenants.a.users.find((user) => user.role === "owner")!.email, password);
    jwtB = await signIn(tenants.b.users.find((user) => user.role === "manager")!.email, password);
    leadId = await create(jwtA, "crm.lead.create");
    foreignLeadId = await create(jwtB, "crm.lead.create");
    customerId = await create(jwtA, "crm.customer.create");
  });

  test("approval persists fields and before/after audit; duplicate approval never reapplies", async () => {
    const [before] = await serviceSelect("customers", `id=eq.${leadId}&select=notes,last_touched_at,next_followup_at`);
    const input = { lead_id: leadId, notes: "e2e-qa reviewed", last_touched_at: "2026-10-21T12:00:00Z", next_followup_at: null };
    const key = crypto.randomUUID();
    const proposal = await propose(jwtA, input, key);
    expect(proposal.status).toBe(201);
    expect(proposal.json.action.status).toBe("awaiting_approval");
    expect(proposal.json.action.risk_level).toBe("medium");
    expect((await serviceSelect("customers", `id=eq.${leadId}&select=notes,last_touched_at,next_followup_at`))[0]).toEqual(before);
    const actionId = proposal.json.action.id;
    expect((await propose(jwtA, input, key)).json.action.id).toBe(actionId);
    expect((await callOperatingManager(jwtB, { operation: "approve", actionId })).status).toBe(404);
    const approved = await callOperatingManager(jwtA, { operation: "approve", actionId });
    expect(approved.status).toBe(200);
    expect(approved.json.result.before).toMatchObject(before);
    expect(approved.json.result.after.notes).toBe(input.notes);
    const [persisted] = await serviceSelect("customers", `id=eq.${leadId}&select=notes,last_touched_at,next_followup_at`);
    expect(persisted.notes).toBe(input.notes);
    expect(Date.parse(persisted.last_touched_at)).toBe(Date.parse(input.last_touched_at));
    expect(persisted.next_followup_at).toBeNull();
    const audit = await serviceSelect("ai_action_audit", `action_id=eq.${actionId}&select=event_type,detail`);
    expect(audit.find((event) => event.event_type === "completed")?.detail.result).toEqual(approved.json.result);
    const later = await propose(jwtA, { lead_id: leadId, notes: "e2e-qa later" });
    expect((await callOperatingManager(jwtA, { operation: "approve", actionId: later.json.action.id })).status).toBe(200);
    expect((await callOperatingManager(jwtA, { operation: "approve", actionId })).json.idempotentReplay).toBe(true);
    expect((await serviceSelect("customers", `id=eq.${leadId}&select=notes`))[0].notes).toBe("e2e-qa later");
  });

  test("foreign, missing and non-lead targets cannot be updated", async () => {
    for (const target of [foreignLeadId, customerId, crypto.randomUUID()]) {
      const before = await serviceSelect("customers", `id=eq.${target}&select=notes`);
      const proposal = await propose(jwtA, { lead_id: target, notes: "must not persist" });
      expect(proposal.status).toBe(201);
      const result = await callOperatingManager(jwtA, { operation: "approve", actionId: proposal.json.action.id });
      expect(result.status).toBe(422);
      expect(result.json.error).toBe("Lead blev ikke fundet");
      expect(await serviceSelect("customers", `id=eq.${target}&select=notes`)).toEqual(before);
    }
  });

  test("rejects forbidden fields, empty changes and invalid timestamps before proposal", async () => {
    for (const changes of [{}, { company_id: crypto.randomUUID() }, { email: "new@example.test" }, { score: 90 }, { status: "invalid" }, { last_touched_at: "" }, { next_followup_at: "tomorrow" }]) {
      expect((await propose(jwtA, { lead_id: leadId, ...changes })).status).toBe(400);
    }
  });

  test("rejecting an update leaves the lead unchanged", async () => {
    const before = await serviceSelect("customers", `id=eq.${leadId}&select=notes`);
    const proposal = await propose(jwtA, { lead_id: leadId, notes: "rejected change" });
    expect(proposal.status).toBe(201);
    const actionId = proposal.json.action.id;
    expect((await callOperatingManager(jwtA, { operation: "reject", actionId })).status).toBe(200);
    expect((await callOperatingManager(jwtA, { operation: "approve", actionId })).status).toBe(409);
    expect(await serviceSelect("customers", `id=eq.${leadId}&select=notes`)).toEqual(before);
  });

  test("readonly users cannot propose or approve lead updates", async () => {
    const { tenants, password } = loadTenants();
    const employee = tenants.a.users.find((user) => user.role === "employee")!;
    const client = createServiceClient();
    const proposal = await propose(jwtA, { lead_id: leadId, notes: "role check" });
    expect(proposal.status).toBe(201);
    try {
      const { error } = await client.from("user_roles").update({ role: "readonly" }).eq("user_id", employee.userId);
      if (error) throw error;
      const readonlyJwt = await signIn(employee.email, password);
      expect((await propose(readonlyJwt, { lead_id: leadId, notes: "forbidden" })).status).toBe(400);
      expect((await callOperatingManager(readonlyJwt, { operation: "approve", actionId: proposal.json.action.id })).status).toBe(403);
      expect((await serviceSelect("autopilot_actions", `id=eq.${proposal.json.action.id}&select=status`))[0].status).toBe("awaiting_approval");
    } finally {
      await client.from("user_roles").update({ role: employee.role }).eq("user_id", employee.userId).throwOnError();
    }
  });
});
