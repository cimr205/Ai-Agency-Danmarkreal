import { test, expect, type Page } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * Critical business flow — Customer → Deal → Quote → Invoice → Payment, exercised
 * through the app's REAL supported UI paths, with persistence-after-refresh and
 * relation checks at every hop. Tenant A only (isolated test tenant); all writes
 * are synthetic test data.
 *
 * Notes on the app's actual data model (verified against the code + SQL):
 *   - Deals require a customer (customer_id) — Customer↔Deal is a hard relation.
 *   - Quotes move draft→sent→accepted (server-enforced in transition_quote); a
 *     quote converts to an invoice only when it resolves a *billable customer*
 *     (quote_to_invoice raises "Quote has no billable customer" otherwise). The
 *     Quotes create UI only links a lead, so the end-to-end conversion precondition
 *     is covered as an error scenario in finance-edge.spec.ts; here we verify the
 *     quote lifecycle itself.
 *   - Invoices bill a customer; a Payment settles an invoice and flips it to paid
 *     (register_invoice_payment). Customer↔Invoice↔Payment are hard relations.
 */
test.use({ storageState: "tests/e2e/.auth/tenantA.json" });
test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }));
      // Suppress the guided product tour — its backdrop intercepts clicks.
      localStorage.setItem("guided_tour_completed", "true");
    } catch { /* ignore */ }
  });
});

/** Create a customer (record_type=customer) via the Clients page. */
async function createCustomer(page: Page, name: string, email: string) {
  await page.goto(`/${LOCALE}/app/clients`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  await page.getByRole("button", { name: /add client/i }).first().click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  await dlg.locator("#client-name").fill(name);
  await dlg.locator("#client-email").fill(email);
  await dlg.getByRole("button", { name: /add client/i }).click();
  await expect(dlg).toBeHidden({ timeout: 10_000 });
}

test("Customer → Deal: deal is linked to the customer and persists after refresh", async ({ page }) => {
  const stamp = Date.now();
  const custName = `QA Cust ${stamp}`;
  const dealTitle = `QA Deal ${stamp}`;

  await test.step("create customer", async () => {
    await createCustomer(page, custName, `qa.cust.${stamp}@example.com`);
  });

  await test.step("create deal linked to that customer", async () => {
    await page.goto(`/${LOCALE}/app/crm/deals?create=true`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible({ timeout: 10_000 });
    await dlg.locator("input").first().fill(dealTitle);
    await dlg.locator('input[type="number"]').fill("50000");
    await dlg.getByRole("combobox").nth(1).click(); // stage = nth 0, customer = nth 1
    await page.getByRole("option", { name: custName }).click();
    await dlg.locator('input[type="date"]').fill("2026-12-31");
    await dlg.getByRole("button", { name: /create deal/i }).click();
    await expect(dlg).toBeHidden({ timeout: 10_000 });
  });

  await test.step("deal appears and persists after a full refresh", async () => {
    await expect(page.getByText(dealTitle).first()).toBeVisible({ timeout: 10_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await expect(page.getByText(dealTitle).first()).toBeVisible({ timeout: 10_000 });
  });
});

test("Quote lifecycle: draft → sent → accepted, persisting after refresh", async ({ page }) => {
  const stamp = Date.now();
  const qTitle = `QA Quote ${stamp}`;

  await test.step("create a draft quote", async () => {
    await page.goto(`/${LOCALE}/app/finance/quotes`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.getByRole("button", { name: /new quote/i }).first().click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible({ timeout: 10_000 });
    await dlg.getByPlaceholder("Q-2026-001").fill(qTitle);
    await dlg.getByPlaceholder(/service or product description/i).fill("QA consulting");
    await dlg.locator('input[type="number"]').nth(1).fill("8000"); // qty(0)=1 default, unit_price(1), vat(2)
    await dlg.getByRole("button", { name: /create quote/i }).click();
    await expect(dlg).toBeHidden({ timeout: 10_000 });
  });

  const row = () => page.getByRole("row").filter({ hasText: qTitle });

  await test.step("draft → sent", async () => {
    await expect(row()).toBeVisible({ timeout: 10_000 });
    await row().getByRole("button", { name: /^sent$/i }).click();
    // After the transition the row exposes the Accepted action.
    await expect(row().getByRole("button", { name: /^accepted$/i })).toBeVisible({ timeout: 10_000 });
  });

  await test.step("sent → accepted", async () => {
    await row().getByRole("button", { name: /^accepted$/i }).click();
    await expect(row()).toContainText(/accepted/i, { timeout: 10_000 });
  });

  await test.step("accepted status persists after refresh", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.getByPlaceholder(/search quotes/i).fill(qTitle);
    await expect(row()).toContainText(/accepted/i, { timeout: 10_000 });
  });
});

test("Invoice → Payment: invoice for a customer is settled and flips to paid, persisting", async ({ page }) => {
  const stamp = Date.now();
  const custName = `QA InvCust ${stamp}`;

  await test.step("create the billed customer", async () => {
    await createCustomer(page, custName, `qa.invcust.${stamp}@example.com`);
  });

  await test.step("create an invoice for that customer", async () => {
    await page.goto(`/${LOCALE}/app/finance/invoices`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.getByRole("button", { name: /new invoice/i }).first().click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible({ timeout: 10_000 });

    // Pick the existing customer via the Command combobox (role=combobox, not button).
    await dlg.getByRole("combobox").filter({ hasText: /select customer/i }).click();
    await page.getByPlaceholder(/search client/i).fill(custName);
    await page.getByRole("option", { name: new RegExp(custName) }).click();

    await dlg.getByRole("tab", { name: /invoice lines/i }).click();

    // Lines step: description + unit price (qty defaults to 1).
    await dlg.getByPlaceholder(/service\/product/i).fill("QA consulting");
    await dlg.locator('input[type="number"]').nth(1).fill("8000"); // qty(0), unit_price(1)
    await dlg.getByRole("button", { name: /create invoice/i }).click();
    await expect(dlg).toBeHidden({ timeout: 15_000 });
  });

  await test.step("invoice appears for the customer", async () => {
    await page.getByPlaceholder(/search invoice no, customer/i).fill(custName);
    await expect(page.getByRole("row").filter({ hasText: custName })).toBeVisible({ timeout: 10_000 });
  });

  await test.step("register a full payment against the invoice", async () => {
    await page.goto(`/${LOCALE}/app/finance/payments`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.getByRole("button", { name: /register payment/i }).first().click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible({ timeout: 10_000 });
    // Invoice dropdown lists unpaid invoices as "<number> – <amount> (<customer>)".
    await dlg.getByRole("combobox").first().click();
    await page.getByRole("option", { name: new RegExp(custName) }).click();
    // Amount auto-fills from the invoice; method defaults to bank transfer.
    await dlg.getByRole("button", { name: /register payment/i }).click();
    await expect(dlg).toBeHidden({ timeout: 10_000 });
  });

  await test.step("payment is recorded against the invoice + customer", async () => {
    await expect(page.getByText(custName).first()).toBeVisible({ timeout: 10_000 });
  });

  await test.step("invoice flipped to paid and persists after refresh", async () => {
    await page.goto(`/${LOCALE}/app/finance/invoices`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.getByPlaceholder(/search invoice no, customer/i).fill(custName);
    const invRow = page.getByRole("row").filter({ hasText: custName });
    await expect(invRow).toContainText(/paid/i, { timeout: 10_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.getByPlaceholder(/search invoice no, customer/i).fill(custName);
    await expect(page.getByRole("row").filter({ hasText: custName })).toContainText(/paid/i, { timeout: 10_000 });
  });
});
