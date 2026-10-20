import { test, expect } from "@playwright/test";
import { APP_ROUTES, LOCALE } from "./registry";

/**
 * Security — direct-URL access control for anonymous users.
 * Every protected route must bounce an unauthenticated visitor to the login
 * screen; none may leak protected content. Runs without credentials, so it
 * is valid coverage even while authenticated E2E is blocked on test accounts.
 */
test.describe("security › anonymous direct-URL access", () => {
  for (const route of APP_ROUTES) {
    test(`${route.module} › ${route.label} redirects to login`, async ({ page }) => {
      await page.goto(`/${LOCALE}/${route.path}`, { waitUntil: "networkidle" });
      // The app must land the anonymous user on the auth flow, not the module.
      await expect
        .poll(() => page.url(), { timeout: 10_000 })
        .toMatch(/\/auth\/(login|join-company|join)/);
      await expect(page.getByRole("textbox", { name: /email/i }).or(page.getByPlaceholder(/email/i)))
        .toBeVisible({ timeout: 10_000 });
    });
  }
});
