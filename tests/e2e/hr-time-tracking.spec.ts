import { test, expect, type Page } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * HR — self-service time tracking (the single-user slice of Workflow C that is
 * testable without a second confirmed account). The current user clocks in,
 * gets an active session, clocks out, and the completed attendance record
 * (check_in + check_out) persists. Multi-employee role separation + manager
 * approval remain BLOCKED (needs ≥2 confirmed accounts — service-role key).
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
async function rget(page: Page, path: string) { const res = await page.request.get(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: ref.value, Authorization: `Bearer ${await tok(page)}` } }); expect(res.ok(), `GET ${path} -> ${res.status()}`).toBeTruthy(); return res.json(); }

test("clock in → active session → clock out records a completed attendance log", async ({ page }) => {
  await page.goto(`/${LOCALE}/app/hr/time-tracking`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);

  // useMyActiveSession auto-provisions the current user's employee profile.
  const start = page.getByRole("button", { name: /start workday|start arbejdsdag/i });
  const stop = page.getByRole("button", { name: /stop workday|stop arbejdsdag/i });

  // If a previous run left a session open, close it first so we start clean.
  if (await stop.isVisible().catch(() => false)) { await stop.click(); await expect(start).toBeVisible({ timeout: 10_000 }); }

  await test.step("clock in starts an active session", async () => {
    await expect(start).toBeVisible({ timeout: 10_000 });
    await start.click();
    await expect(stop).toBeVisible({ timeout: 10_000 });
  });

  await test.step("clock out ends the session", async () => {
    await stop.click();
    await expect(start).toBeVisible({ timeout: 10_000 });
  });

  await test.step("a completed attendance log (check_in + check_out) is persisted", async () => {
    await expect.poll(async () => {
      const rows = await rget(page, `attendance_logs?select=check_in,check_out&order=created_at.desc&limit=1`);
      return rows[0]?.check_in && rows[0]?.check_out ? "done" : "pending";
    }, { timeout: 10_000 }).toBe("done");
  });
});
