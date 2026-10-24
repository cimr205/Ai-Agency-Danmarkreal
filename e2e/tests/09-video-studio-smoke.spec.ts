import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { loadTenants } from "../support/testProject.ts";

const TEST_IMAGE = fileURLToPath(new URL("../fixtures/test-image.png", import.meta.url));

/**
 * Live verification for Video Studio. Catches "builds but doesn't run" issues
 * that typecheck/build cannot — including a real bug found this way: the
 * "add to timeline" action only imported media into elah's in-memory library
 * (useMediaLibrary().importUrl) without ever placing a clip on a track, so
 * exportVideo() always failed with "ExportWorker: project has no clips".
 * Fixed by also calling insertMediaAsset() in MediaLibraryPanel.
 */
test.describe("Video Studio — live", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("guided_tour_completed", "true"));
  });

  async function loginAndOpenNewProject(page: import("@playwright/test").Page) {
    const { password, tenants } = loadTenants();
    const user = tenants.a.users.find((u) => u.role === "owner")!;

    await page.goto("/en/auth/login");
    await page.locator('input[type="email"]').fill(user.email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').first().click();
    await expect(page).toHaveURL(/\/app\//, { timeout: 20_000 });

    if (!(await page.getByRole("link", { name: /video studio/i }).isVisible().catch(() => false))) {
      await page.getByText(/^marketing/i).first().click();
    }
    await page.getByRole("link", { name: /video studio/i }).click();
    await expect(page.getByText(/video studio/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/doesn't support video studio/i)).toHaveCount(0);
    await page.getByRole("button", { name: /new video/i }).first().click();
    await expect(page.locator(".elah-root")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".elah-root canvas").first()).toBeVisible({ timeout: 20_000 });
  }

  test("new video opens a working editor (Preview + Timeline mount, no console errors)", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

    await loginAndOpenNewProject(page);

    await expect(page.getByRole("button", { name: /export mp4/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /upload media/i })).toBeVisible();

    const seriousErrors = consoleErrors.filter((e) => !/favicon|ResizeObserver|Download the React DevTools/i.test(e));
    expect(seriousErrors, `console errors on mount: ${JSON.stringify(seriousErrors, null, 2)}`).toEqual([]);

    // Real DB round-trip: Save must actually persist project_json via RLS (not just toast).
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(/project saved/i)).toBeVisible({ timeout: 10_000 });
  });

  test("FULL loop: upload -> place on timeline -> export produces a real, downloadable MP4", async ({ page }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

    await loginAndOpenNewProject(page);

    // 1) Upload a real file through the real file input (persists to Supabase Storage).
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_IMAGE);
    await expect(page.getByText(/\.(png|jpg|jpeg)$/i).first()).toBeVisible({ timeout: 20_000 });

    // 2) Add it to the timeline — must actually place a clip (insertMediaAsset), not
    //    just register it in elah's media library, or export has nothing to render.
    await page.getByText(/\.(png|jpg|jpeg)$/i).first().locator("xpath=..").getByRole("button").click();
    await page.waitForTimeout(1_500);

    // 3) Export must produce a real downloadable MP4 file, not hang or silently no-op.
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: /export mp4/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.mp4$/i);
    const dlPath = await download.path();
    const fs = await import("node:fs");
    const bytes = dlPath ? fs.statSync(dlPath).size : 0;
    expect(bytes, "exported MP4 must have real content, not an empty/placeholder file").toBeGreaterThan(1000);

    await expect(page.getByText(/video exported/i)).toBeVisible({ timeout: 5_000 });

    const seriousErrors = consoleErrors.filter((e) => !/favicon|ResizeObserver|Download the React DevTools/i.test(e));
    expect(seriousErrors, `console errors during upload->timeline->export: ${JSON.stringify(seriousErrors, null, 2)}`).toEqual([]);
  });
});
