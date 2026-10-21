import { test, expect, type Page } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * Work & Calendar. A calendar event can be created and persists, and a
 * scheduled task (a task with a due date — the Customer→Task→Calendar link)
 * surfaces on the calendar. Tenant A; synthetic data.
 */
const SUPABASE_URL = "https://vbxlpxhvojlaisxcipyh.supabase.co";
test.use({ storageState: "tests/e2e/.auth/tenantA.json" });
test.setTimeout(90_000);

const ref = { value: "" };
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true })); localStorage.setItem("guided_tour_completed", "true"); } catch { /* ignore */ } });
  page.on("request", (r) => { if (!ref.value && r.url().startsWith(SUPABASE_URL)) { const k = r.headers()["apikey"]; if (k) ref.value = k; } });
});
async function tok(page: Page) { return page.evaluate(() => { const k = Object.keys(localStorage).find(x => /sb-.*-auth-token/.test(x)); const v = JSON.parse(localStorage.getItem(k!)!); return v.access_token || v?.currentSession?.access_token; }); }

test("create a calendar event; it persists after refresh", async ({ page }) => {
  const stamp = Date.now();
  const title = `QA Meeting ${stamp}`;
  const d = new Date(); const day = d.toISOString().slice(0, 10);
  await page.goto(`/${LOCALE}/app/work/calendar`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  await page.getByRole("button", { name: /new event|ny begivenhed|opret/i }).first().click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  await dlg.locator("#title").fill(title);
  await dlg.locator("#start_time").fill(`${day}T10:00`);
  await dlg.locator("#end_time").fill(`${day}T11:00`);
  await dlg.getByRole("button", { name: /create|opret|gem|save/i }).click();
  await expect(dlg).toBeHidden({ timeout: 10_000 });

  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });
});

test("a scheduled task appears on the calendar (Customer→Task→Calendar)", async ({ page }) => {
  const stamp = Date.now();
  const taskTitle = `QA CalTask ${stamp}`;
  // Put it on a quiet day of the current month (today's cell is crowded with
  // accumulated test tasks and truncates to "+N more", hiding the title).
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-28`;
  await page.goto(`/${LOCALE}/app/work/calendar`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  const prof = (await (await page.request.get(`${SUPABASE_URL}/rest/v1/profiles?select=user_id,company_id`, { headers: { apikey: ref.value, Authorization: `Bearer ${await tok(page)}` } })).json())[0];
  const ins = await page.request.post(`${SUPABASE_URL}/rest/v1/tasks`, {
    headers: { apikey: ref.value, Authorization: `Bearer ${await tok(page)}`, "Content-Type": "application/json", Prefer: "return=representation" },
    data: { company_id: prof.company_id, created_by: prof.user_id, title: taskTitle, status: "pending", priority: "high", due_date: today },
  });
  expect(ins.ok(), `task insert -> ${ins.status()}`).toBeTruthy();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  // Tasks surface on the calendar prefixed with a clipboard emoji.
  await expect(page.getByText(new RegExp(taskTitle)).first()).toBeVisible({ timeout: 10_000 });
});
