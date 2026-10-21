import { test, expect } from "@playwright/test";
import { loadTenants, signIn, callOperatingManager } from "../support/testProject.ts";

/**
 * Authorization: role-gated actions must be refused for insufficient roles.
 * `crm.deal.create` / `invoice.create` require MANAGER_ROLES per the registry.
 */
test.describe("authorization (role gating)", () => {
  test("an employee cannot approve a manager-only action (403)", async () => {
    const { password, tenants } = loadTenants();
    const owner = tenants.a.users.find((u) => u.role === "owner")!;
    const employee = tenants.a.users.find((u) => u.role === "employee")!;

    const ownerJwt = await signIn(owner.email, password);
    const employeeJwt = await signIn(employee.email, password);

    // Owner proposes a manager-gated action.
    const proposed = await callOperatingManager(ownerJwt, {
      operation: "propose", actionName: "crm.deal.create",
      input: { title: "E2E deal", value: 1000 }, idempotencyKey: `e2e-authz-${Date.now()}`,
    });
    // propose may itself require manager; if so the owner (who can) creates it.
    expect([200, 201]).toContain(proposed.status);
    const actionId = proposed.json.action.id;

    // Employee attempts to approve → must be 403.
    const attempt = await callOperatingManager(employeeJwt, { operation: "approve", actionId });
    expect(attempt.status).toBe(403);
  });
});
