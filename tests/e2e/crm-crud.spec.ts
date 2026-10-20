import { test, expect } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * CRM › Leads — real CRUD through the UI, verified in the list and after a
 * full page refresh (mandate: CRUD + persistence-after-refresh). Writes only
 * to the isolated QA Tenant A.
 */
test.use({ storageState: "tests/e2e/.auth/tenantA.json" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() })); } catch { /* ignore */ }
  });
});

test("create a lead → appears in the list → persists after refresh", async ({ page }) => {
  const stamp = Date.now();
  const name = `QA Lead ${stamp}`;
  const email = `qa.lead.${stamp}@example.com`;

  await page.goto(`/${LOCALE}/app/crm/leads?create=true`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const inputs = dialog.locator("input");
  await inputs.nth(0).fill(name);
  await inputs.nth(1).fill(email);
  await inputs.nth(2).fill("+4512345678");
  await inputs.nth(3).fill("QA Lead Co");
  await dialog.getByRole("button", { name: /add lead/i }).click();

  // The dialog should close and the lead should be visible (search to avoid pagination).
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  const search = page.getByPlaceholder(/search|søg|suche/i).first();
  await search.fill(name);
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });

  // Persistence: full reload, the lead is still there.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  await page.getByPlaceholder(/search|søg|suche/i).first().fill(name);
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
});
