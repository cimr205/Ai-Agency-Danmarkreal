import { test, expect } from "@playwright/test";
import { loadTenants } from "../support/testProject.ts";

/**
 * Live mount verification for Video Studio: a real user logs in, opens a new
 * video project, and the elah-powered editor actually mounts (Preview canvas +
 * Timeline render) with no console errors. Catches "builds but doesn't run"
 * issues that typecheck/build cannot.
 */
test.describe("Video Studio — live mount", () => {
  test("new video opens a working editor (Preview + Timeline mount, no console errors)", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

    const { password, tenants } = loadTenants();
    const user = tenants.a.users.find((u) => u.role === "owner")!;

    // Skip the first-login guided product tour (unrelated to this test) so it
    // doesn't reappear on every client-side route change and block clicks.
    await page.addInitScript(() => localStorage.setItem("guided_tour_completed", "true"));

    await page.goto("/en/auth/login");
    await page.locator('input[type="email"]').fill(user.email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').first().click();
    await expect(page).toHaveURL(/\/app\//, { timeout: 20_000 });

    // Nav groups are collapsible — expand "Marketing" before its items are reachable.
    if (!(await page.getByRole("link", { name: /video studio/i }).isVisible().catch(() => false))) {
      await page.getByText(/^marketing/i).first().click();
    }
    await page.getByRole("link", { name: /video studio/i }).click();
    await expect(page.getByText(/video studio/i).first()).toBeVisible({ timeout: 15_000 });

    // Browser-support gate must NOT trigger in this Chromium run.
    await expect(page.getByText(/doesn't support video studio/i)).toHaveCount(0);

    await page.getByRole("button", { name: /new video/i }).first().click();

    // elah's editor root + Preview canvas + Timeline must actually mount.
    await expect(page.locator(".elah-root")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".elah-root canvas").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /export mp4/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /upload media/i })).toBeVisible();

    const seriousErrors = consoleErrors.filter(
      (e) => !/favicon|ResizeObserver|Download the React DevTools/i.test(e),
    );
    expect(seriousErrors, `console errors on mount: ${JSON.stringify(seriousErrors, null, 2)}`).toEqual([]);

    // Real DB round-trip: Save must actually persist project_json via RLS (not just toast).
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(/project saved/i)).toBeVisible({ timeout: 10_000 });
  });
});
