import { test, expect, type BrowserContext } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * Security › cross-tenant isolation. A record created in Tenant A must never
 * be visible to Tenant B. Backend-enforced (RLS); this proves it end-to-end
 * through the real UI with two isolated tenants.
 */
async function ctxFor(browser, state: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({ storageState: state });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() })); } catch { /* ignore */ }
  });
  return ctx;
}

test("a lead created in Tenant A is invisible to Tenant B", async ({ browser }) => {
  const marker = `XTENANT-${Date.now()}`;

  // Tenant A creates the marker lead.
  const aCtx = await ctxFor(browser, "tests/e2e/.auth/tenantA.json");
  const a = await aCtx.newPage();
  await a.goto(`/${LOCALE}/app/crm/leads?create=true`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(a);
  const dialog = a.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const inputs = dialog.locator("input");
  await inputs.nth(0).fill(marker);
  await inputs.nth(1).fill(`${marker.toLowerCase()}@example.com`);
  await dialog.getByRole("button", { name: /add lead/i }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  // Confirm A really has it.
  await a.getByPlaceholder(/search|søg|suche/i).first().fill(marker);
  await expect(a.getByText(marker).first()).toBeVisible({ timeout: 10_000 });

  // Tenant B must NOT see it.
  const bCtx = await ctxFor(browser, "tests/e2e/.auth/tenantB.json");
  const b = await bCtx.newPage();
  await b.goto(`/${LOCALE}/app/crm/leads`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(b);
  await b.getByPlaceholder(/search|søg|suche/i).first().fill(marker);
  await b.waitForTimeout(2000);
  await expect(b.getByText(marker), "Tenant B must not see Tenant A's lead").toHaveCount(0);

  await aCtx.close();
  await bCtx.close();
});
