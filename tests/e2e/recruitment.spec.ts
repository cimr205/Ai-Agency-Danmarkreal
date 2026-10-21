import { test, expect, type Page } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * Issue 7 — Recruitment (openings slice). The create form now captures the rich
 * fields the backend already supports (department, salary, description,
 * requirements), and the opening status lifecycle persists. The full applicant
 * journey (candidates/interviews/decisions) has no backend table and is not
 * built here. Tenant A; synthetic data.
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

test("create a rich job opening and advance its status; both persist", async ({ page }) => {
  const stamp = Date.now();
  const position = `QA Cleaner ${stamp}`;
  await page.goto(`/${LOCALE}/app/hr/recruitment`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);

  await test.step("create an opening with department/salary/description/requirements", async () => {
    await page.getByRole("button", { name: /new position|ny stilling|opret/i }).first().click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible({ timeout: 10_000 });
    const inputs = dlg.locator("input");
    await inputs.nth(0).fill(position);           // position
    await inputs.nth(1).fill("Operations");       // department
    await inputs.nth(2).fill("28.000–34.000 kr."); // salary range
    await dlg.locator("textarea").nth(0).fill("Daily office cleaning for B2B clients.");
    await dlg.locator("textarea").nth(1).fill("Reliable, own transport, Danish or English.");
    await dlg.getByRole("button", { name: /create position|opret/i }).click();
    await expect(dlg).toBeHidden({ timeout: 10_000 });
  });

  let recId = "";
  await test.step("all fields persisted", async () => {
    const rows = await rget(page, `recruitment?select=id,position,department,description,requirements,salary_range,status&position=eq.${encodeURIComponent(position)}`);
    expect(rows.length).toBe(1);
    expect(rows[0].department).toBe("Operations");
    expect(rows[0].salary_range).toBe("28.000–34.000 kr.");
    expect(rows[0].description).toContain("Daily office cleaning");
    expect(rows[0].requirements).toContain("Reliable");
    expect(rows[0].status).toBe("open");
    recId = rows[0].id;
  });

  await test.step("advance status open → interviewing (persists)", async () => {
    const row = page.getByRole("row").filter({ hasText: position });
    await row.getByRole("combobox").click();
    await page.getByRole("option", { name: /interviewing|samtaler/i }).click();
    await expect.poll(async () => (await rget(page, `recruitment?select=status&id=eq.${recId}`))[0]?.status, { timeout: 10_000 }).toBe("interviewing");
  });
});
