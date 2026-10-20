import { test, expect, type Page } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

const SUPABASE_URL = "https://vbxlpxhvojlaisxcipyh.supabase.co";

/** Read the captured Supabase apikey + the fresh access token from the page. */
async function supaCreds(page: Page, apikeyRef: { value: string }) {
  await expect.poll(() => apikeyRef.value, { timeout: 15_000 }).not.toBe("");
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((x) => /sb-.*-auth-token/.test(x));
    if (!key) return "";
    const v = JSON.parse(localStorage.getItem(key)!);
    return v.access_token || v?.currentSession?.access_token || "";
  });
  expect(token).not.toBe("");
  return { apikey: apikeyRef.value, token };
}

/**
 * MILESTONE 1 — the complete MANUAL sales flow, end to end, through the real UI:
 *
 *   Lead → (convert) → Customer + Deal → Quote → accept → Invoice → Payment → paid
 *
 * This is the acceptance path from /goal §6. It exercises the atomic
 * convert_lead_to_deal RPC (find-or-create customer, no duplicates) and the
 * quote→invoice conversion (quote_to_invoice, which requires the lead to carry
 * a billable converted_customer_id). Every hop is checked for persistence after
 * a full refresh. Tenant A only; synthetic data; no real payments.
 */
test.use({ storageState: "tests/e2e/.auth/tenantA.json" });
test.setTimeout(150_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }));
      localStorage.setItem("guided_tour_completed", "true");
    } catch { /* ignore */ }
  });
});

test("manual: Lead → Customer+Deal → Quote → Invoice → Payment", async ({ page }) => {
  const stamp = Date.now();
  const leadName = `QA Flow Lead ${stamp}`;
  const leadEmail = `qa.flow.${stamp}@example.com`;
  // Unique phone per run: the convert RPC dedupes customers by normalized
  // email *and* phone, so a shared phone would (correctly) match an earlier
  // run's customer instead of creating a new one.
  const leadPhone = `+45${String(stamp).slice(-8)}`;
  const qTitle = `QA Flow Quote ${stamp}`;

  // Capture the Supabase apikey from the first live request (for REST assertions).
  const apikeyRef = { value: "" };
  page.on("request", (req) => {
    if (!apikeyRef.value && req.url().startsWith(SUPABASE_URL)) {
      const k = req.headers()["apikey"];
      if (k) apikeyRef.value = k;
    }
  });

  await test.step("create a lead", async () => {
    await page.goto(`/${LOCALE}/app/crm/leads?create=true`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible({ timeout: 10_000 });
    const inputs = dlg.locator("input");
    await inputs.nth(0).fill(leadName);
    await inputs.nth(1).fill(leadEmail);
    await inputs.nth(2).fill(leadPhone);
    await inputs.nth(3).fill("QA Flow Co");
    await dlg.getByRole("button", { name: /add lead/i }).click();
    await expect(dlg).toBeHidden({ timeout: 10_000 });
  });

  await test.step("convert the lead → customer + deal (atomic)", async () => {
    await page.getByPlaceholder(/search/i).first().fill(leadName);
    await page.getByText(leadName).first().click(); // row opens the detail panel
    await page.getByRole("button", { name: /convert to deal/i }).click();
    // The RPC creates the customer + deal and the app navigates to the deals page.
    await expect(page).toHaveURL(/\/app\/crm\/deals/, { timeout: 15_000 });
    await expectAppMounted(page);
    await expect(page.getByText(new RegExp(`Deal: ${leadName}`)).first()).toBeVisible({ timeout: 10_000 });
  });

  await test.step("the deal (and its customer link) persists after refresh", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await expect(page.getByText(new RegExp(`Deal: ${leadName}`)).first()).toBeVisible({ timeout: 10_000 });
  });

  await test.step("create a quote linked to the converted lead", async () => {
    await page.goto(`/${LOCALE}/app/finance/quotes`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.getByRole("button", { name: /new quote/i }).first().click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible({ timeout: 10_000 });
    await dlg.getByPlaceholder("Q-2026-001").fill(qTitle);
    // Link the lead (now carrying converted_customer_id) so the quote is billable.
    await dlg.getByRole("combobox").click();
    await page.getByRole("option", { name: leadName }).click();
    await dlg.getByPlaceholder(/service or product description/i).fill("QA consulting");
    await dlg.locator('input[type="number"]').nth(1).fill("8000");
    await dlg.getByRole("button", { name: /create quote/i }).click();
    await expect(dlg).toBeHidden({ timeout: 10_000 });
  });

  const quoteRow = () => page.getByRole("row").filter({ hasText: qTitle });

  await test.step("accept the quote (draft → sent → accepted)", async () => {
    await expect(quoteRow()).toBeVisible({ timeout: 10_000 });
    await quoteRow().getByRole("button", { name: /^sent$/i }).click();
    await quoteRow().getByRole("button", { name: /^accepted$/i }).click();
    await expect(quoteRow()).toContainText(/accepted/i, { timeout: 10_000 });
  });

  await test.step("convert the accepted quote → invoice", async () => {
    await quoteRow().getByRole("button", { name: /create invoice/i }).click();
    // On success the convert action disappears (converted_invoice_id is set).
    await expect(quoteRow().getByRole("button", { name: /create invoice/i })).toHaveCount(0, { timeout: 15_000 });
  });

  await test.step("invoice exists for the converted customer", async () => {
    await page.goto(`/${LOCALE}/app/finance/invoices`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.getByPlaceholder(/search invoice no, customer/i).fill(leadName);
    await expect(page.getByRole("row").filter({ hasText: leadName })).toBeVisible({ timeout: 10_000 });
  });

  await test.step("register a full payment → invoice becomes paid", async () => {
    await page.goto(`/${LOCALE}/app/finance/payments`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.getByRole("button", { name: /register payment/i }).first().click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible({ timeout: 10_000 });
    await dlg.getByRole("combobox").first().click();
    await page.getByRole("option", { name: new RegExp(leadName) }).click();
    await dlg.getByRole("button", { name: /register payment/i }).click();
    await expect(dlg).toBeHidden({ timeout: 10_000 });
  });

  await test.step("invoice is paid and persists after refresh", async () => {
    await page.goto(`/${LOCALE}/app/finance/invoices`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.getByPlaceholder(/search invoice no, customer/i).fill(leadName);
    await expect(page.getByRole("row").filter({ hasText: leadName })).toContainText(/paid/i, { timeout: 10_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.getByPlaceholder(/search invoice no, customer/i).fill(leadName);
    await expect(page.getByRole("row").filter({ hasText: leadName })).toContainText(/paid/i, { timeout: 10_000 });
  });

  await test.step("the customer page shows the full history (deal + invoice + payment)", async () => {
    await page.goto(`/${LOCALE}/app/clients`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.getByPlaceholder(/search client/i).fill(leadName);
    await page.getByText(leadName).first().click();
    await expect(page).toHaveURL(/\/app\/clients\/[0-9a-f-]+/, { timeout: 10_000 });
    await expectAppMounted(page);
    // Finance ledger lists the invoice and the payment; the deal shows in its section.
    await expect(page.getByText(/Faktura #/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/^Betaling$/).first()).toBeVisible();
    await expect(page.getByText(new RegExp(`Deal: ${leadName}`)).first()).toBeVisible();
  });

  await test.step("log a contact/follow-up — visible in the timeline and persisted", async () => {
    const note = `QA follow-up ${stamp}`;
    const customerId = page.url().match(/\/app\/clients\/([0-9a-f-]+)/)?.[1];
    expect(customerId, "should be on the customer detail page").toBeTruthy();

    await page.getByPlaceholder(/hvad skete der/i).fill(note);
    await page.getByRole("button", { name: /log aktivitet/i }).click();
    // Immediately reflected in the customer timeline.
    await expect(page.getByText(note).first()).toBeVisible({ timeout: 10_000 });

    // Authoritative persistence check: the activity row exists in the DB,
    // scoped to this customer (survives any client-cache question).
    const creds = await supaCreds(page, apikeyRef);
    await expect
      .poll(async () => {
        const res = await page.request.get(
          `${SUPABASE_URL}/rest/v1/crm_activities?select=id,body,type&entity_type=eq.customer&entity_id=eq.${customerId}&body=eq.${encodeURIComponent(note)}`,
          { headers: { apikey: creds.apikey, Authorization: `Bearer ${creds.token}` } },
        );
        return res.ok() ? ((await res.json()) as unknown[]).length : -1;
      }, { timeout: 10_000 })
      .toBe(1);

    // And it is still rendered after a full page reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await expect(page.getByText(note).first()).toBeVisible({ timeout: 15_000 });
  });
});
