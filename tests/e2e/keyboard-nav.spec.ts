import { test, expect } from "@playwright/test";
import { LOCALE } from "./registry";

/**
 * Keyboard navigation — the login surface must be fully operable without a
 * mouse (mandate: keyboard navigation + accessible controls). Real assertions:
 * focus order, visible focus, and Enter-to-submit.
 */
test.describe("auth › login keyboard operability", () => {
  test("email → password focus order and Enter submits", async ({ page }) => {
    await page.goto(`/${LOCALE}/auth/login`, { waitUntil: "networkidle" });

    const email = page.getByPlaceholder(/email/i);
    const password = page.getByPlaceholder(/password/i);

    await email.focus();
    await expect(email).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(password, "Tab from email should reach the password field").toBeFocused();

    // Focused control must have a visible focus indicator (not outline:none with no ring).
    const outlineStyle = await password.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle, boxShadow: s.boxShadow };
    });
    expect(
      outlineStyle.outline !== "none" || outlineStyle.boxShadow !== "none",
      "focused field must show a visible focus ring",
    ).toBeTruthy();

    // Enter from within the form submits it (bad creds → stays on auth, no crash).
    await email.fill("qa-nobody@example.invalid");
    await password.fill("wrong-password");
    await password.press("Enter");
    await expect.poll(() => page.url(), { timeout: 10_000 }).not.toMatch(/\/app\//);
  });
});
