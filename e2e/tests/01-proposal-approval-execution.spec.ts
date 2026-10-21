import { test, expect } from "@playwright/test";
import { loadTenants, signIn, callOperatingManager, serviceSelect } from "../support/testProject.ts";

/**
 * Core pipeline: agent proposal → approval → execution → DB persistence.
 * Driven as an authenticated Company-A owner against the test project.
 */
test.describe("proposal → approval → execution → persistence", () => {
  test("owner proposes a tasks.create DRAFT, approves it, and it persists as completed", async () => {
    const { password, tenants } = loadTenants();
    const owner = tenants.a.users.find((u) => u.role === "owner")!;
    const jwt = await signIn(owner.email, password);

    // 1) propose (DRAFT) — should land awaiting_approval, scoped to company A
    const idem = `e2e-task-${Date.now()}`;
    const proposed = await callOperatingManager(jwt, {
      operation: "propose",
      actionName: "tasks.create",
      input: { title: "E2E task", description: "created by e2e" },
      idempotencyKey: idem,
    });
    expect(proposed.status).toBe(201);
    const actionId = proposed.json.action.id;
    expect(["awaiting_approval", "proposed"]).toContain(proposed.json.action.status);

    // 2) approve → executes
    const approved = await callOperatingManager(jwt, { operation: "approve", actionId });
    expect(approved.status).toBe(200);
    expect(approved.json.action.status).toBe("completed");

    // 3) DB persistence: the autopilot_actions row is completed under company A
    const rows = await serviceSelect("autopilot_actions", `id=eq.${actionId}&select=id,status,company_id`);
    expect(rows[0].status).toBe("completed");
    expect(rows[0].company_id).toBe(tenants.a.companyId);

    // 4) audit trail exists (column is event_type)
    const audit = await serviceSelect("ai_action_audit", `action_id=eq.${actionId}&select=event_type`);
    const events = audit.map((r) => r.event_type);
    expect(events).toEqual(expect.arrayContaining(["completed"]));
  });
});
