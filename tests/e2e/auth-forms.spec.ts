import { test, expect } from "@playwright/test";
import { LOCALE } from "./registry";

/**
 * Auth form validation — real input handling, credential-free (mandate:
 * forms / validation / error states / feedback). Every invalid submission
 * must be rejected with a visible error and must never leave the auth flow.
 */
test.beforeEach(async ({ page }) => {
  // Pre-seed privacy-preserving consent so the cookie banner never intercepts
  // the submit button near the bottom of the form.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }));
    } catch { /* ignore */ }
  });
});

const errors = (page) => page.locator(".text-destructive");

test.describe("auth › signup validation", () => {
  test("empty submit shows required-field errors and stays on signup", async ({ page }) => {
    await page.goto(`/${LOCALE}/auth/signup`, { waitUntil: "networkidle" });
    await page.locator('form button[type="submit"]').click();
    await expect(errors(page).first()).toBeVisible({ timeout: 8_000 });
    expect(page.url()).toMatch(/\/auth\/signup/);
  });

  test("mismatched passwords are rejected", async ({ page }) => {
    await page.goto(`/${LOCALE}/auth/signup`, { waitUntil: "networkidle" });
    await page.locator("form input").first().fill("QA Tester");
    await page.locator('input[type="email"]').fill("qa.form@example.com");
    const pw = page.locator('input[type="password"]');
    await pw.nth(0).fill("QaAutopilot!2026");
    await pw.nth(1).fill("DifferentPass!2026");
    await page.locator('form button[type="submit"]').click();
    await expect(errors(page).first()).toBeVisible({ timeout: 8_000 });
    expect(page.url()).toMatch(/\/auth\/signup/);
  });

  test("weak (too short) password is rejected", async ({ page }) => {
    await page.goto(`/${LOCALE}/auth/signup`, { waitUntil: "networkidle" });
    await page.locator("form input").first().fill("QA Tester");
    await page.locator('input[type="email"]').fill("qa.form2@example.com");
    const pw = page.locator('input[type="password"]');
    await pw.nth(0).fill("short");
    await pw.nth(1).fill("short");
    await page.locator('form button[type="submit"]').click();
    await expect(errors(page).first()).toBeVisible({ timeout: 8_000 });
    expect(page.url()).toMatch(/\/auth\/signup/);
  });
});

test.describe("auth › login & forgot-password validation", () => {
  test("login empty submit does not authenticate", async ({ page }) => {
    await page.goto(`/${LOCALE}/auth/login`, { waitUntil: "networkidle" });
    await page.locator('form button[type="submit"]').click();
    await page.waitForTimeout(1500);
    expect(page.url(), "empty login must not reach the app").not.toMatch(/\/app\//);
    expect(page.url()).toMatch(/\/auth\/login/);
  });

  test("forgot-password empty submit stays on the form", async ({ page }) => {
    await page.goto(`/${LOCALE}/auth/forgot-password`, { waitUntil: "networkidle" });
    await page.locator('form button[type="submit"]').click();
    await page.waitForTimeout(1500);
    expect(page.url()).toMatch(/\/auth\/forgot-password/);
  });
});
