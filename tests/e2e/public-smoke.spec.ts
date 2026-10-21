import { test, expect } from "@playwright/test";
import { PUBLIC_ROUTES, LOCALE } from "./registry";
import { captureErrors, expectAppMounted, checkA11y } from "./helpers";

/**
 * Public (unauthenticated) smoke — the slice of coverage that needs no
 * credentials. Each route must mount real content, raise no uncaught errors,
 * and carry no critical accessibility violations. "It loaded" is not enough.
 */
for (const route of PUBLIC_ROUTES) {
  test.describe(`${route.module} › ${route.label}`, () => {
    test("renders without errors", async ({ page }, info) => {
      const errors = captureErrors(page);
      const resp = await page.goto(`/${LOCALE}/${route.path}`, { waitUntil: "networkidle" });
      expect(resp?.status(), `HTTP status for /${LOCALE}/${route.path}`).toBeLessThan(400);
      await expectAppMounted(page);
      expect(errors.page, `Uncaught exceptions on ${route.label}`).toEqual([]);
      expect(errors.console, `Console errors on ${route.label}`).toEqual([]);
    });

    test("has no critical a11y violations", async ({ page }, info) => {
      await page.goto(`/${LOCALE}/${route.path}`, { waitUntil: "networkidle" });
      await expectAppMounted(page);
      await checkA11y(page, info);
    });
  });
}
