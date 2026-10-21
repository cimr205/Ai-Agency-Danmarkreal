import { test, expect } from "@playwright/test";
import { LOCALE } from "./registry";
import { captureErrors } from "./helpers";

/**
 * Auth › login form behaviour — real interaction, no valid credentials needed.
 * Covers error states + user feedback (mandate: REAL USER TESTING / feedback)
 * and the security guarantee that bad credentials never authenticate.
 */
test.describe("auth › login form", () => {
  test("rejects invalid credentials and keeps the user on login with feedback", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`/${LOCALE}/auth/login`, { waitUntil: "networkidle" });

    await page.getByPlaceholder(/email/i).fill("qa-nobody@example.invalid");
    await page.getByPlaceholder(/password/i).fill("definitely-wrong-password");
    await page.getByRole("button", { name: /sign in|log ind|anmelden/i }).click();

    // Must NOT authenticate: the user stays in the auth flow, never reaches /app.
    await expect
      .poll(() => page.url(), { timeout: 10_000 })
      .not.toMatch(/\/app\//);
    expect(page.url(), "bad credentials must not leave the auth flow").toMatch(/\/auth\/login/);

    // The failure must surface as feedback (toast / alert), not a silent no-op.
    const feedback = page.getByRole("alert").or(page.locator("[data-sonner-toast], .sonner-toast, [role='status']"));
    await expect(feedback.first()).toBeVisible({ timeout: 10_000 });

    // A rejected login is expected behaviour, not an app crash.
    expect(errors.page, "no uncaught exceptions during a failed login").toEqual([]);
  });
});
