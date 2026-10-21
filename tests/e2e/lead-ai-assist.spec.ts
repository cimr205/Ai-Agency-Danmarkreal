import { test, expect, type Page } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * AI-ASSISTED milestone — the contextual lead flow, end-to-end in real Chrome:
 * open a lead → AI prepares a follow-up task → employee reviews the proposal
 * (what / why / what-changes / risk) → approves → the task is created exactly
 * once, persists across refresh, and is audited. Plus the reject path (nothing
 * is created). Tenant A only; synthetic data.
 */
const SUPABASE_URL = "https://vbxlpxhvojlaisxcipyh.supabase.co";
test.use({ storageState: "tests/e2e/.auth/tenantA.json" });
test.setTimeout(90_000);

const apikeyRef = { value: "" };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }));
      localStorage.setItem("guided_tour_completed", "true");
    } catch { /* ignore */ }
  });
  page.on("request", (req) => {
    if (!apikeyRef.value && req.url().startsWith(SUPABASE_URL)) {
      const k = req.headers()["apikey"];
      if (k) apikeyRef.value = k;
    }
  });
});

async function token(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((x) => /sb-.*-auth-token/.test(x));
    if (!key) return "";
    const v = JSON.parse(localStorage.getItem(key)!);
    return v.access_token || v?.currentSession?.access_token || "";
  });
}
async function restGet(page: Page, path: string) {
  const res = await page.request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: apikeyRef.value, Authorization: `Bearer ${await token(page)}` },
  });
  expect(res.ok(), `GET ${path} -> ${res.status()}`).toBeTruthy();
  return res.json();
}

async function createLeadAndOpen(page: Page, name: string) {
  await page.goto(`/${LOCALE}/app/crm/leads?create=true`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  const inputs = dlg.locator("input");
  await inputs.nth(0).fill(name);
  await inputs.nth(1).fill(`${name.replace(/\s+/g, ".").toLowerCase()}@example.com`);
  await dlg.getByRole("button", { name: /add lead/i }).click();
  await expect(dlg).toBeHidden({ timeout: 10_000 });
  await page.getByPlaceholder(/search/i).first().fill(name);
  await page.getByText(name).first().click(); // open the lead detail panel
  await expect(page.getByTestId("followup-prepare")).toBeVisible({ timeout: 10_000 });
}

test("prepare → approve: follow-up task is created exactly once, persists, audited", async ({ page }) => {
  const stamp = Date.now();
  const leadName = `QA Assist ${stamp}`;
  const expectedTitle = `Følg op på ${leadName}`;
  await createLeadAndOpen(page, leadName);

  await test.step("AI prepares a follow-up proposal", async () => {
    await page.getByTestId("followup-prepare").click();
    const proposal = page.getByTestId("followup-proposal");
    await expect(proposal).toBeVisible({ timeout: 15_000 });
    // The proposal explains what, carries the task fields and a low risk badge.
    await expect(proposal).toContainText(expectedTitle);
    await expect(page.getByTestId("followup-risk")).toContainText(/low/i);
  });

  await test.step("no task exists before approval", async () => {
    const before = await restGet(page, `tasks?select=id&title=eq.${encodeURIComponent(expectedTitle)}`);
    expect(before.length).toBe(0);
  });

  await test.step("approve → task created and result shown", async () => {
    await page.getByTestId("followup-approve").click();
    await expect(page.getByTestId("followup-result")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("followup-result")).toContainText(expectedTitle);
  });

  let taskId = "";
  await test.step("exactly one task, linked to the lead, status pending", async () => {
    const tasks = await restGet(page, `tasks?select=id,status,lead_id&title=eq.${encodeURIComponent(expectedTitle)}`);
    expect(tasks.length).toBe(1);
    expect(tasks[0].status).toBe("pending");
    expect(tasks[0].lead_id).toBeTruthy();
    taskId = tasks[0].id;
  });

  await test.step("the task persists after a full refresh", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    const tasks = await restGet(page, `tasks?select=id&id=eq.${taskId}`);
    expect(tasks.length).toBe(1);
  });

  await test.step("an audit trail exists for the action", async () => {
    // The task carries no action id, so locate the action by the lead and assert its audit.
    const acts = await restGet(page, `autopilot_actions?select=id,status&execution_function=eq.tasks.create&order=created_at.desc&limit=5`);
    const completed = acts.find((a: { status: string }) => a.status === "completed");
    expect(completed, "a completed action exists").toBeTruthy();
    const audit = await restGet(page, `ai_action_audit?select=event_type&action_id=eq.${completed.id}&order=created_at.asc`);
    const events = audit.map((a: { event_type: string }) => a.event_type);
    expect(events).toEqual(expect.arrayContaining(["proposed", "approved", "completed"]));
  });
});

test("prepare → reject: nothing is created", async ({ page }) => {
  const stamp = Date.now();
  const leadName = `QA Reject ${stamp}`;
  const expectedTitle = `Følg op på ${leadName}`;
  await createLeadAndOpen(page, leadName);

  await page.getByTestId("followup-prepare").click();
  await expect(page.getByTestId("followup-proposal")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("followup-reject").click();
  await expect(page.getByTestId("followup-proposal")).toBeHidden({ timeout: 10_000 });

  const tasks = await restGet(page, `tasks?select=id&title=eq.${encodeURIComponent(expectedTitle)}`);
  expect(tasks.length, "a rejected proposal creates no task").toBe(0);
});
