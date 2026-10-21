import { test, expect } from "@playwright/test";
import { loadTenants, signIn, callOperatingManager, serviceSelect } from "../support/testProject.ts";

/**
 * CRM / Marketing / Finance / HR vertical workflows — propose + approve by an
 * authorized role and assert persistence. Inputs match the registry's
 * requiredFields exactly. NO real sends/payments (invoice + campaign are drafts;
 * email.send is never exercised).
 */
async function proposeApprove(jwt: string, actionName: string, input: unknown, dept: string) {
  const proposed = await callOperatingManager(jwt, {
    operation: "propose", actionName, input, idempotencyKey: `e2e-${dept}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  });
  expect([200, 201], `${actionName} propose: ${JSON.stringify(proposed.json)}`).toContain(proposed.status);
  const actionId = proposed.json.action.id;
  const approved = await callOperatingManager(jwt, { operation: "approve", actionId });
  expect(approved.status, `${actionName} approve: ${JSON.stringify(approved.json)}`).toBe(200);
  expect(approved.json.action.status).toBe("completed");
  const rows = await serviceSelect("autopilot_actions", `id=eq.${actionId}&select=status,company_id`);
  expect(rows[0].status).toBe("completed");
  return approved.json;
}

test.describe("department workflows (propose → approve → persist)", () => {
  let jwt = "";
  let companyA = "";
  test.beforeAll(async () => {
    const { password, tenants } = loadTenants();
    companyA = tenants.a.companyId;
    const owner = tenants.a.users.find((u) => u.role === "owner")!; // owner can execute every role-gated action
    jwt = await signIn(owner.email, password);
  });

  test("CRM: crm.lead.create", async () => {
    await proposeApprove(jwt, "crm.lead.create", { name: "E2E CRM Lead", email: "e2e-qa-crm@e2e.aiagencydk.test" }, "CRM");
  });

  test("Marketing: marketing.campaign.create (draft)", async () => {
    await proposeApprove(jwt, "marketing.campaign.create", { subject: "E2E Campaign" }, "MKT");
  });

  test("Finance: customer then invoice.create (draft, no payment)", async () => {
    const cust = await proposeApprove(jwt, "crm.customer.create", { name: "E2E Customer", email: "e2e-qa-cust@e2e.aiagencydk.test" }, "FIN-cust");
    const customerId = cust.result?.id ?? cust.action?.result?.id;
    expect(customerId, `customer id from result: ${JSON.stringify(cust.result)}`).toBeTruthy();
    await proposeApprove(jwt, "invoice.create", { customer_id: customerId, amount: 1000 }, "FIN-inv");
  });

  test("HR: hr.employee.create", async () => {
    await proposeApprove(jwt, "hr.employee.create", { employee_id: "E2E-EMP-1", full_name: "E2E Employee", email: "e2e-qa-emp@e2e.aiagencydk.test" }, "HR");
  });
});
