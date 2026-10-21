import { test, expect } from "@playwright/test";
import { loadTenants, signIn, callOperatingManager, serviceSelect } from "../support/testProject.ts";

/**
 * Cross-tenant isolation: Company A must never read or act on Company B's data.
 */
test.describe("cross-tenant isolation", () => {
  test("Company B user cannot approve Company A's action (scoped by company_id → 404)", async () => {
    const { password, tenants } = loadTenants();
    const aOwner = tenants.a.users.find((u) => u.role === "owner")!;
    const bManager = tenants.b.users.find((u) => u.role === "manager")!;

    const aJwt = await signIn(aOwner.email, password);
    const bJwt = await signIn(bManager.email, password);

    // A proposes under company A
    const proposed = await callOperatingManager(aJwt, {
      operation: "propose", actionName: "tasks.create",
      input: { title: "A-only task" }, idempotencyKey: `e2e-iso-${Date.now()}`,
    });
    const aActionId = proposed.json.action.id;

    // B tries to approve A's action → must NOT be found under B's company
    const bAttempt = await callOperatingManager(bJwt, { operation: "approve", actionId: aActionId });
    expect(bAttempt.status).toBe(404); // "Action not found" — scoped away

    // A's action remains not-completed by B
    const rows = await serviceSelect("autopilot_actions", `id=eq.${aActionId}&select=status,company_id`);
    expect(rows[0].company_id).toBe(tenants.a.companyId);
    expect(rows[0].status).not.toBe("completed");
  });

  test("Company B user authenticated to the REST API cannot read Company A rows (RLS)", async () => {
    const { password, tenants } = loadTenants();
    const bUser = tenants.b.users[0];
    const bJwt = await signIn(bUser.email, password);

    // Authenticated REST read as B, filtered to A's company → RLS must return empty.
    const { url, anonKey } = (await import("../support/testProject.ts")).testConfig();
    const res = await fetch(`${url}/rest/v1/leads?company_id=eq.${tenants.a.companyId}&select=id`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${bJwt}` },
    });
    const data = await res.json();
    expect(Array.isArray(data) ? data.length : 0).toBe(0);
  });
});
