import { test, expect, type Page, type APIResponse } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * Finance error & edge scenarios — overpayment, invalid amounts, illegal state
 * transitions and concurrency. The UI tests assert what a user sees; the RPC
 * tests prove the server-side invariants hold even when a client bypasses the
 * UI (data integrity). Tenant A only; synthetic test data.
 */
const SUPABASE_URL = "https://vbxlpxhvojlaisxcipyh.supabase.co";

test.use({ storageState: "tests/e2e/.auth/tenantA.json" });
test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }));
      localStorage.setItem("guided_tour_completed", "true");
    } catch { /* ignore */ }
  });
});

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

/** Create a draft invoice (unit price 8000 → total 10 000 incl. 25% VAT) for a customer. */
async function createInvoiceFor(page: Page, custName: string) {
  await page.goto(`/${LOCALE}/app/finance/invoices`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  await page.getByRole("button", { name: /new invoice/i }).first().click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  await dlg.getByRole("combobox").filter({ hasText: /select customer/i }).click();
  await page.getByPlaceholder(/search client/i).fill(custName);
  await page.getByRole("option", { name: new RegExp(custName) }).click();
  await dlg.getByRole("tab", { name: /invoice lines/i }).click();
  await dlg.getByPlaceholder(/service\/product/i).fill("QA consulting");
  await dlg.locator('input[type="number"]').nth(1).fill("8000");
  await dlg.getByRole("button", { name: /create invoice/i }).click();
  await expect(dlg).toBeHidden({ timeout: 15_000 });
}

/** Capture the Supabase apikey (from live request headers) + the fresh access token. */
async function supaCreds(page: Page): Promise<{ apikey: string; token: string }> {
  let apikey = "";
  page.on("request", (req) => {
    if (!apikey && req.url().startsWith(SUPABASE_URL)) {
      const k = req.headers()["apikey"];
      if (k) apikey = k;
    }
  });
  await page.goto(`/${LOCALE}/app/finance/quotes`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  await expect.poll(() => apikey, { timeout: 15_000 }).not.toBe("");
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((x) => /sb-.*-auth-token/.test(x));
    if (!key) return "";
    const v = JSON.parse(localStorage.getItem(key)!);
    return v.access_token || v?.currentSession?.access_token || "";
  });
  expect(token, "a fresh access token must be present").not.toBe("");
  return { apikey, token };
}

function rpc(page: Page, fn: string, body: Record<string, unknown>, creds: { apikey: string; token: string }): Promise<APIResponse> {
  return page.request.post(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    headers: { apikey: creds.apikey, Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    data: body,
  });
}

async function restGet(page: Page, path: string, creds: { apikey: string; token: string }) {
  const res = await page.request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: creds.apikey, Authorization: `Bearer ${creds.token}` },
  });
  expect(res.ok(), `GET ${path} -> ${res.status()}`).toBeTruthy();
  return res.json();
}

test("overpayment is rejected and the invoice stays unpaid", async ({ page }) => {
  const stamp = Date.now();
  const cust = `QA Over ${stamp}`;
  await createCustomer(page, cust, `qa.over.${stamp}@example.com`);
  await createInvoiceFor(page, cust);

  await page.goto(`/${LOCALE}/app/finance/payments`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  await page.getByRole("button", { name: /register payment/i }).first().click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  await dlg.getByRole("combobox").first().click();
  await page.getByRole("option", { name: new RegExp(cust) }).click();
  // Pay far more than the 10 000 invoice total.
  await dlg.locator('input[type="number"]').fill("999999");
  await dlg.getByRole("button", { name: /register payment/i }).click();

  // The server rejects it: error toast, dialog stays open, no success.
  await expect(page.getByText(/could not register payment/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/payment registered/i)).toHaveCount(0);

  // The invoice must not have been settled.
  await page.goto(`/${LOCALE}/app/finance/invoices`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  await page.getByPlaceholder(/search invoice no, customer/i).fill(cust);
  await expect(page.getByRole("row").filter({ hasText: cust })).not.toContainText(/paid/i);
});

test("a non-positive payment amount is rejected and the invoice stays unpaid", async ({ page }) => {
  const stamp = Date.now();
  const cust = `QA Neg ${stamp}`;
  await createCustomer(page, cust, `qa.neg.${stamp}@example.com`);
  await createInvoiceFor(page, cust);

  await page.goto(`/${LOCALE}/app/finance/payments`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  await page.getByRole("button", { name: /register payment/i }).first().click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  await dlg.getByRole("combobox").first().click();
  await page.getByRole("option", { name: new RegExp(cust) }).click();
  await dlg.locator('input[type="number"]').fill("-500");
  await dlg.getByRole("button", { name: /register payment/i }).click();

  await expect(page.getByText(/could not register payment/i)).toBeVisible({ timeout: 10_000 });

  await page.goto(`/${LOCALE}/app/finance/invoices`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  await page.getByPlaceholder(/search invoice no, customer/i).fill(cust);
  await expect(page.getByRole("row").filter({ hasText: cust })).not.toContainText(/paid/i);
});

test("illegal quote transition (draft → accepted) is rejected server-side", async ({ page }) => {
  const stamp = Date.now();
  const qTitle = `QA EdgeQuote ${stamp}`;
  const creds = await supaCreds(page);

  // Create a draft quote through the UI.
  await page.getByRole("button", { name: /new quote/i }).first().click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  await dlg.getByPlaceholder("Q-2026-001").fill(qTitle);
  await dlg.getByPlaceholder(/service or product description/i).fill("QA");
  await dlg.locator('input[type="number"]').nth(1).fill("5000");
  await dlg.getByRole("button", { name: /create quote/i }).click();
  await expect(dlg).toBeHidden({ timeout: 10_000 });

  const quotes = await restGet(page, `quotes?select=id,status&title=eq.${encodeURIComponent(qTitle)}&limit=1`, creds);
  expect(quotes.length, "the draft quote should exist").toBe(1);
  expect(quotes[0].status).toBe("draft");
  const quoteId = quotes[0].id;

  // Attempt to jump straight to accepted (skipping sent) — must be rejected.
  const res = await rpc(page, "transition_quote", { p_quote_id: quoteId, p_target_status: "accepted" }, creds);
  expect(res.ok(), "draft → accepted must not be allowed").toBeFalsy();
  expect(await res.text()).toMatch(/invalid quote transition/i);

  // The quote must still be draft.
  const after = await restGet(page, `quotes?select=status&id=eq.${quoteId}`, creds);
  expect(after[0].status).toBe("draft");
});

test("concurrent full payments settle the invoice exactly once (no double-charge)", async ({ page }) => {
  const stamp = Date.now();
  const cust = `QA Conc ${stamp}`;
  const creds = await supaCreds(page);
  await createCustomer(page, cust, `qa.conc.${stamp}@example.com`);
  await createInvoiceFor(page, cust);

  // Newest invoice is the one we just created (serial workers).
  const inv = await restGet(page, `invoices?select=id,amount,status&order=created_at.desc&limit=1`, creds);
  const invoiceId = inv[0].id as string;
  const amount = Number(inv[0].amount);
  expect(amount).toBeGreaterThan(0);

  // Fire two full payments at once with distinct idempotency keys.
  const [a, b] = await Promise.all([
    rpc(page, "register_invoice_payment", { p_invoice_id: invoiceId, p_amount: amount, p_payment_method: "bank_transfer", p_idempotency_key: `conc-a-${stamp}` }, creds),
    rpc(page, "register_invoice_payment", { p_invoice_id: invoiceId, p_amount: amount, p_payment_method: "bank_transfer", p_idempotency_key: `conc-b-${stamp}` }, creds),
  ]);
  const oks = [a, b].filter((r) => r.ok()).length;
  expect(oks, "exactly one of two concurrent full payments may succeed").toBe(1);

  // Exactly one completed payment of the full amount; invoice is paid once.
  const pays = await restGet(page, `payments?select=amount,status&invoice_id=eq.${invoiceId}&status=eq.completed`, creds);
  const settled = pays.reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);
  expect(settled).toBe(amount);
  const after = await restGet(page, `invoices?select=status&id=eq.${invoiceId}`, creds);
  expect(after[0].status).toBe("paid");
});
