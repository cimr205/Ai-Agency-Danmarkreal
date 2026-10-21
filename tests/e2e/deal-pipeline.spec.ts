import { test, expect, type Page } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * CRM — deal pipeline stage progression. A deal's stage can be advanced through
 * the pipeline (update_deal_stage RPC) and the change persists after refresh.
 * Tenant A; synthetic data.
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

test("deal stage can be advanced through the pipeline and persists", async ({ page }) => {
  const stamp = Date.now();
  const dealTitle = `QA Pipeline ${stamp}`;

  await page.goto(`/${LOCALE}/app/crm/deals`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  const h = { apikey: ref.value, Authorization: `Bearer ${await tok(page)}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const prof = (await rget(page, `profiles?select=user_id,company_id`))[0];

  // A customer + a deal in the first stage.
  const cust = await (await page.request.post(`${SUPABASE_URL}/rest/v1/customers`, { headers: h, data: { company_id: prof.company_id, created_by: prof.user_id, record_type: "customer", status: "customer", name: `QA PipeCust ${stamp}`, email: `qa.pipe.${stamp}@example.com` } })).json();
  const dealIns = await page.request.post(`${SUPABASE_URL}/rest/v1/deals`, { headers: h, data: { company_id: prof.company_id, created_by: prof.user_id, title: dealTitle, stage: "discovery", customer_id: cust[0].id, value: 25000 } });
  expect(dealIns.ok(), `deal insert -> ${dealIns.status()}`).toBeTruthy();
  const dealId = (await dealIns.json())[0].id as string;

  await test.step("advance the deal's stage via the detail sheet", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.getByText(dealTitle).first().click(); // open the detail sheet
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    // The stage select currently reads "Discovery"; move it to "Proposal".
    await sheet.getByRole("combobox").filter({ hasText: /discovery|opdagelse/i }).first().click();
    await page.getByRole("option", { name: /^(proposal|tilbud)$/i }).click();
    await expect(page.getByText(/deal stage updated|stadie opdateret/i)).toBeVisible({ timeout: 10_000 });
  });

  await test.step("the new stage is persisted server-side and after refresh", async () => {
    const deals = await rget(page, `deals?select=stage&id=eq.${dealId}`);
    expect(deals[0].stage).toBe("proposal");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.getByText(dealTitle).first().click(); // reopen the detail sheet
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByRole("combobox").filter({ hasText: /proposal|tilbud/i })).toBeVisible({ timeout: 10_000 });
  });
});
