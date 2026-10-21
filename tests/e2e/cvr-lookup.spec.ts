import { test, expect } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * Issue 2 — CVR lookup. The frontend previously built the function URL from an
 * undefined VITE_SUPABASE_PROJECT_ID (every call hit https://undefined.supabase.co)
 * and stripped the input to digits (so name search was impossible). Now it uses
 * supabase.functions.invoke and passes the raw term.
 *
 * The live provider (cvrapi.dk) is quota-blocked on the edge IP, so the function
 * call is verified here against a contract fixture (intercepted response) — this
 * proves the frontend chain (invoke → map response → autofill) works end-to-end.
 */
const SUPABASE_URL = "https://vbxlpxhvojlaisxcipyh.supabase.co";
test.use({ storageState: "tests/e2e/.auth/tenantA.json" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true })); localStorage.setItem("guided_tour_completed", "true"); } catch { /* ignore */ } });
});

test("CVR lookup autofills company name + address from a valid result", async ({ page }) => {
  await page.route("**/functions/v1/cvr-search", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ name: "NOVO NORDISK A/S", address: "Novo Alle 1", zipcode: "2880", city: "Bagsværd", cvr: "24256790" }], total: 1, query: "24256790" }),
    }),
  );

  await page.goto(`/${LOCALE}/app/clients`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  await page.getByRole("button", { name: /add client/i }).first().click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible({ timeout: 10_000 });

  // The CVR lookup field invites a CVR number OR a company name.
  await dlg.getByPlaceholder(/indtast cvr/i).fill("24256790");
  await dlg.getByPlaceholder(/indtast cvr/i).press("Enter");

  // The client form is autofilled from the lookup result.
  await expect(dlg.locator("#client-name")).toHaveValue(/NOVO NORDISK A\/S/i, { timeout: 10_000 });
});

test("CVR lookup shows an honest 'not found' message for an empty result", async ({ page }) => {
  await page.route("**/functions/v1/cvr-search", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [], total: 0, query: "99999999" }) }),
  );

  await page.goto(`/${LOCALE}/app/clients`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  await page.getByRole("button", { name: /add client/i }).first().click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  await dlg.getByPlaceholder(/indtast cvr/i).fill("99999999");
  await dlg.getByPlaceholder(/indtast cvr/i).press("Enter");

  await expect(page.getByText(/ingen virksomhed fundet/i)).toBeVisible({ timeout: 10_000 });
  await expect(dlg.locator("#client-name")).toHaveValue("");
});
