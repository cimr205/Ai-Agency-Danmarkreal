import { test, expect } from "@playwright/test";
import { loadTenants } from "../support/testProject.ts";

/**
 * Authenticated UI smoke — the frontend (served on E2E_APP_BASE_URL with the
 * TEST Supabase env) authenticates a real test user via supabase.auth and
 * renders the authenticated app. Proves the "frontend update" leg end-to-end.
 */
test.describe("authenticated UI smoke", () => {
  test("a test user logs in and reaches the authenticated dashboard", async ({ page }) => {
    const { password, tenants } = loadTenants();
    const user = tenants.a.users.find((u) => u.role === "owner")!;

    await page.goto("/en/auth/login");
    await page.locator('input[type="email"]').fill(user.email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').first().click();

    // After auth the app routes to /{locale}/app/dashboard.
    await expect(page).toHaveURL(/\/app\//, { timeout: 20_000 });
    // A stable authenticated marker: the app shell (sidebar/nav).
    await expect(page.locator("nav, aside, [data-testid='app-shell']").first()).toBeVisible({ timeout: 15_000 });
  });
});
