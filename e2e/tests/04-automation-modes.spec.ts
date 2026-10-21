import { test, expect } from "@playwright/test";
import { loadTenants, signIn, callOperatingManager, testConfig } from "../support/testProject.ts";

/**
 * Automation modes OFF / DRAFT_APPROVAL / AUTO.
 *
 * Mandatory approval must NOT be bypassed: high-risk actions always await
 * approval regardless of mode. Low-risk behavior under AUTO is asserted as the
 * server implements it. NOTE: confirm the exact mode strings your deployment
 * uses — set via set_company_mode (service role).
 */
async function setMode(companyId: string, mode: string) {
  const { url, serviceRoleKey } = testConfig();
  const res = await fetch(`${url}/rest/v1/rpc/set_company_mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    body: JSON.stringify({ _company_id: companyId, _mode: mode }),
  });
  // set_company_mode requires is_company_admin(auth.uid()); if service-role rpc
  // is rejected, set companies.mode directly via REST as a fallback.
  if (!res.ok) {
    await fetch(`${url}/rest/v1/companies?id=eq.${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Prefer: "return=minimal" },
      body: JSON.stringify({ mode }),
    });
  }
}

test.describe("automation modes", () => {
  test("DRAFT_APPROVAL: proposals await human approval", async () => {
    const { password, tenants } = loadTenants();
    await setMode(tenants.a.companyId, "draft_approval");
    const owner = tenants.a.users.find((u) => u.role === "owner")!;
    const jwt = await signIn(owner.email, password);
    const res = await callOperatingManager(jwt, {
      operation: "propose", actionName: "tasks.create",
      input: { title: "mode-draft" }, idempotencyKey: `e2e-mode-draft-${Date.now()}`,
    });
    expect(res.status).toBe(201);
    expect(["awaiting_approval", "proposed"]).toContain(res.json.action.status);
  });

  test("OFF / AUTO: mandatory approval for high-risk is never bypassed", async () => {
    const { password, tenants } = loadTenants();
    const owner = tenants.a.users.find((u) => u.role === "owner")!;
    const jwt = await signIn(owner.email, password);

    for (const mode of ["off", "auto"]) {
      await setMode(tenants.a.companyId, mode);
      // invoice.create is high-risk → must still require approval, never auto-execute.
      const res = await callOperatingManager(jwt, {
        operation: "propose", actionName: "invoice.create",
        input: { customer_id: tenants.a.recordIds.leads[0], amount: 100 },
        idempotencyKey: `e2e-mode-${mode}-${Date.now()}`,
      });
      expect([200, 201]).toContain(res.status);
      // high-risk must not be auto-completed by mode alone
      expect(res.json.action.status).not.toBe("completed");
    }
  });
});
