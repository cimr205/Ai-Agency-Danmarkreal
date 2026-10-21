import { test, expect, type Page } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * WORKFLOW B — Service operations:
 *   Customer → service task → employee assignment → schedule → progress → completion,
 *   traceable back to the customer.
 *
 * Driven as the manager/admin in real Chrome. A separate employee account can't
 * be provisioned here (signup needs email confirmation — pre-existing blocker),
 * so the assignee is the admin and the assignment→visibility mechanic is checked
 * via assigned_to + the task's presence; true multi-user role separation is a
 * documented limitation. Tenant A writes only; Tenant B proves isolation.
 */
const SUPABASE_URL = "https://vbxlpxhvojlaisxcipyh.supabase.co";
test.use({ storageState: "tests/e2e/.auth/tenantA.json" });
test.setTimeout(90_000);

const shared = { taskTitle: "", customerId: "", customerName: "" };

function attach(page: Page, ref: { value: string }) {
  page.on("request", (r) => { if (!ref.value && r.url().startsWith(SUPABASE_URL)) { const k = r.headers()["apikey"]; if (k) ref.value = k; } });
}
async function tok(page: Page) {
  return page.evaluate(() => { const k = Object.keys(localStorage).find(x => /sb-.*-auth-token/.test(x)); const v = JSON.parse(localStorage.getItem(k!)!); return v.access_token || v?.currentSession?.access_token; });
}
async function rget(page: Page, path: string, ref: { value: string }) {
  const res = await page.request.get(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: ref.value, Authorization: `Bearer ${await tok(page)}` } });
  expect(res.ok(), `GET ${path} -> ${res.status()}`).toBeTruthy();
  return res.json();
}

test.describe("Tenant A — service task lifecycle", () => {
  const ref = { value: "" };
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true })); localStorage.setItem("guided_tour_completed", "true"); } catch { /* ignore */ } });
    attach(page, ref);
  });

  test("create customer-linked assigned task → progress → complete → traceable", async ({ page }) => {
    const stamp = Date.now();
    shared.customerName = `QA SvcCust ${stamp}`;
    shared.taskTitle = `Rengøring hos ${shared.customerName}`;
    const today = new Date().toISOString().slice(0, 10);

    await page.goto(`/${LOCALE}/app/work/tasks`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);

    const prof = await rget(page, `profiles?select=user_id,company_id`, ref);
    const myUserId = prof[0].user_id as string;

    // A customer to service.
    const ins = await page.request.post(`${SUPABASE_URL}/rest/v1/customers`, {
      headers: { apikey: ref.value, Authorization: `Bearer ${await tok(page)}`, "Content-Type": "application/json", Prefer: "return=representation" },
      data: { company_id: prof[0].company_id, created_by: myUserId, record_type: "customer", status: "customer", name: shared.customerName, email: `qa.svc.${stamp}@example.com` },
    });
    expect(ins.ok()).toBeTruthy();
    shared.customerId = (await ins.json())[0].id;

    await test.step("manager creates a service task for the customer, assigned + scheduled", async () => {
      await page.reload({ waitUntil: "domcontentloaded" }); // pick up the new customer in the picker
      await expectAppMounted(page);
      await page.getByRole("button", { name: /^(new task|ny opgave)$/i }).click();
      const dlg = page.getByRole("dialog");
      await expect(dlg).toBeVisible({ timeout: 10_000 });
      await dlg.locator("#title").fill(shared.taskTitle);
      await dlg.locator("#due_date").fill(today);
      // assignee (2nd combobox) → the only teammate (the admin)
      await dlg.getByRole("combobox").nth(1).click();
      await page.getByRole("option").nth(1).click();
      // related customer (3rd combobox)
      await dlg.getByRole("combobox").nth(2).click();
      await page.getByRole("option", { name: shared.customerName }).click();
      await dlg.getByRole("button", { name: /create|opret|gem/i }).click();
      await expect(dlg).toBeHidden({ timeout: 10_000 });
    });

    const card = () => page.locator(".transition-all", { hasText: shared.taskTitle }).first();

    await test.step("task shows the linked customer and the assignee", async () => {
      await page.getByPlaceholder(/search|søg/i).first().fill(shared.taskTitle);
      await expect(card()).toBeVisible({ timeout: 10_000 });
      await expect(card()).toContainText(shared.customerName); // customer chip
    });

    await test.step("task is structurally linked to the customer and assigned to the employee", async () => {
      const tasks = await rget(page, `tasks?select=id,lead_id,assigned_to,status&title=eq.${encodeURIComponent(shared.taskTitle)}`, ref);
      expect(tasks.length).toBe(1);
      expect(tasks[0].lead_id).toBe(shared.customerId);
      expect(tasks[0].assigned_to).toBe(myUserId);
    });

    await test.step("employee advances the task: pending → in progress → completed", async () => {
      // pending → in progress (task stays in the active view)
      await card().getByRole("combobox").first().click();
      await page.getByRole("option", { name: /in progress|i gang|igang/i }).click();
      await expect(card()).toContainText(/in progress|i gang|igang/i, { timeout: 10_000 });
      // in progress → completed (completed tasks leave the active view, so verify
      // via the Completed tab rather than the active card that disappears).
      await card().getByRole("combobox").first().click();
      await page.getByRole("option", { name: /^(completed|afsluttet|fuldført|færdig)$/i }).click();
      await page.getByText(/^(Completed|Afsluttet|Fuldført)\s*\(\d+\)/i).first().click();
      await expect(page.locator(".transition-all", { hasText: shared.taskTitle }).first()).toBeVisible({ timeout: 10_000 });
    });

    await test.step("completion is persisted (status + completed_at)", async () => {
      const tasks = await rget(page, `tasks?select=status,completed_at&title=eq.${encodeURIComponent(shared.taskTitle)}`, ref);
      expect(tasks[0].status).toBe("completed");
      expect(tasks[0].completed_at).toBeTruthy();
    });

    await test.step("the task is traceable on the customer timeline", async () => {
      await page.goto(`/${LOCALE}/app/clients/${shared.customerId}`, { waitUntil: "domcontentloaded" });
      await expectAppMounted(page);
      await expect(page.getByText(new RegExp(`Opgave:.*${shared.customerName}`)).first()).toBeVisible({ timeout: 10_000 });
    });
  });
});

test.describe("Tenant B — isolation", () => {
  const ref = { value: "" };
  test.use({ storageState: "tests/e2e/.auth/tenantB.json" });
  test.beforeEach(({ page }) => attach(page, ref));

  test("cannot see another tenant's service task", async ({ page }) => {
    expect(shared.taskTitle).not.toBe("");
    await page.goto(`/${LOCALE}/app/work/tasks`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    const tasks = await rget(page, `tasks?select=id&title=eq.${encodeURIComponent(shared.taskTitle)}`, ref);
    expect(tasks.length).toBe(0);
  });
});
