import { test, expect } from "@playwright/test";
import { APP_ROUTES, LOCALE } from "./registry";
import { captureErrors, expectAppMounted } from "./helpers";

/**
 * Authenticated module smoke — Tenant A (company_admin). Every module must
 * load for a logged-in admin: no bounce to login/subscription/onboarding,
 * real content mounted, no uncaught exceptions. "It loaded" alone is not a
 * pass — we assert the module actually rendered its own content.
 * (system_admin-only admin routes are covered separately — Tenant A is a
 * company admin, not a platform admin.)
 */
test.use({ storageState: "tests/e2e/.auth/tenantA.json" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() })); } catch { /* ignore */ }
  });
});

const authable = APP_ROUTES.filter((r) => r.access !== "system_admin");

for (const route of authable) {
  test(`${route.module} › ${route.label} loads for an authenticated admin`, async ({ page }) => {
    const errors = captureErrors(page);
    // Authed pages hold open Supabase realtime sockets/polling, so "networkidle"
    // never resolves — wait for DOM + real content instead.
    await page.goto(`/${LOCALE}/${route.path}`, { waitUntil: "domcontentloaded" });
    await expectAppMounted(page);
    await page.waitForTimeout(700); // let the subscription/onboarding gate settle
    // Must not bounce to login or onboarding. The subscription page is itself a
    // valid route, so only treat a subscription redirect as a failure for OTHER modules.
    expect(page.url(), `${route.label} must not bounce to login/onboarding`).not.toMatch(/\/auth\/login|\/app\/onboarding/);
    if (route.path !== "app/subscription") {
      expect(page.url(), `${route.label} must not bounce to the subscription paywall`).not.toMatch(/\/app\/subscription/);
    }
    expect(errors.page, `uncaught exception on ${route.label}`).toEqual([]);
  });
}

test.describe("security › platform-admin routes denied to a company admin", () => {
  for (const route of APP_ROUTES.filter((r) => r.access === "system_admin")) {
    test(`${route.label} is not accessible to a non-platform-admin`, async ({ page }) => {
      await page.goto(`/${LOCALE}/${route.path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      // Must be redirected away from the platform-admin surface.
      expect(page.url(), `${route.label} must not render for a company admin`).not.toMatch(new RegExp(route.path.replace(/\//g, "\\/")));
    });
  }
});
