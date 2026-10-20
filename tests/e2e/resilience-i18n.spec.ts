import { test, expect } from "@playwright/test";
import { LOCALE } from "./registry";
import { captureErrors, expectAppMounted } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }));
    } catch { /* ignore */ }
  });
});

test.describe("routing › not-found", () => {
  test("unknown route renders a real NotFound page, not a crash", async ({ page }) => {
    const errors = captureErrors(page);
    const resp = await page.goto(`/${LOCALE}/this-route-does-not-exist-xyz-123`, { waitUntil: "networkidle" });
    expect(resp?.status()).toBeLessThan(400); // SPA serves index.html
    await expect(page.getByText(/not found|404|findes ikke|nicht gefunden/i).first()).toBeVisible({ timeout: 8_000 });
    expect(errors.page, "NotFound must not throw").toEqual([]);
  });
});

test.describe("i18n › localized rendering", () => {
  for (const loc of ["da", "de"] as const) {
    test(`${loc} login renders localized with no leaked translation keys`, async ({ page }) => {
      const errors = captureErrors(page);
      await page.goto(`/${loc}/auth/login`, { waitUntil: "networkidle" });
      await expectAppMounted(page);
      const body = await page.locator("body").innerText();
      // A missing translation typically renders the raw dotted key (e.g. "auth.loginTitle").
      expect(body, "no raw i18n keys should leak to the UI").not.toMatch(/\b(auth|common|nav)\.[a-zA-Z][a-zA-Z0-9_]+\b/);
      expect(errors.console, `console errors on ${loc} login`).toEqual([]);
    });
  }
});

test.describe("resilience › API failure", () => {
  test("login page survives blocked backend requests without crashing", async ({ page }) => {
    const errors = captureErrors(page);
    await page.route(/supabase\.co|aiagencydanmark\.dk/, (route) => route.abort());
    await page.goto(`/${LOCALE}/auth/login`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);

    await page.getByPlaceholder(/email/i).fill("x@example.com");
    await page.getByPlaceholder(/password/i).fill("whatever12345");
    await page.locator('form button[type="submit"]').click();
    await page.waitForTimeout(2500);

    // The failed backend call must surface as "stayed on login", never a crash
    // and never a bogus authentication.
    expect(page.url(), "blocked login must not reach the app").not.toMatch(/\/app\//);
    expect(page.url()).toMatch(/\/auth\/login/);
    expect(errors.page, "no uncaught exception when the backend is unreachable").toEqual([]);
  });
});
