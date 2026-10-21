import { test, expect } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * Responsive smoke — the core operational pages must mount and expose their
 * primary action on a phone-sized viewport (run via the `mobile` project,
 * 390×844). Catches layouts that break or hide the primary CTA on mobile.
 * Tenant A; read-only (no writes).
 */
test.use({ storageState: "tests/e2e/.auth/tenantA.json" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true })); localStorage.setItem("guided_tour_completed", "true"); } catch { /* ignore */ }
  });
});

const pages: { path: string; cta: RegExp }[] = [
  { path: "app/crm/leads", cta: /add lead|new lead|opret|ny lead/i },
  { path: "app/clients", cta: /add client|ny klient|new client/i },
  { path: "app/crm/deals", cta: /new deal|ny deal|opret/i },
  { path: "app/finance/invoices", cta: /new invoice|ny faktura/i },
  { path: "app/finance/quotes", cta: /new quote|nyt tilbud/i },
  { path: "app/work/tasks", cta: /^(new task|ny opgave)$/i },
];

for (const p of pages) {
  test(`mobile: ${p.path} mounts and shows its primary action`, async ({ page }) => {
    await page.goto(`/${LOCALE}/${p.path}`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    // No horizontal overflow: the document isn't wider than the viewport.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "page must not scroll horizontally on mobile").toBeLessThanOrEqual(2);
    // The primary action is reachable (may live behind the responsive layout but must exist & be visible).
    await expect(page.getByRole("button", { name: p.cta }).first()).toBeVisible({ timeout: 10_000 });
  });
}
