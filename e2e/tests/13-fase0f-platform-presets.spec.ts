import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { loadTenants } from "../support/testProject.ts";

const TEST_VIDEO = fileURLToPath(new URL("../fixtures/test-video-with-audio.webm", import.meta.url));

/**
 * Fase 0f proof: the platform-preset picker must actually change the exported file's
 * resolution/aspect ratio, not just cosmetically label the project (masterprompt Done
 * criterion: "preset choice changes export format (verified on file)"). Reads the real
 * decoded video dimensions from the downloaded MP4 via an in-browser <video> element —
 * no ffprobe dependency needed.
 */
async function login(page: import("@playwright/test").Page) {
  await page.addInitScript(() => localStorage.setItem("guided_tour_completed", "true"));
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
}

async function createWithPreset(page: import("@playwright/test").Page, presetName: RegExp) {
  await page.getByRole("button", { name: /new video/i }).click();
  await page.getByRole("menuitem", { name: presetName }).click();
  await expect(page.locator(".elah-root canvas").first()).toBeVisible({ timeout: 20_000 });
}

async function addClipAndExport(page: import("@playwright/test").Page): Promise<{ width: number; height: number }> {
  await page.locator('input[type="file"]').setInputFiles(TEST_VIDEO);
  await expect(page.getByText(/\.webm$/i).first()).toBeVisible({ timeout: 20_000 });
  await page.getByText(/\.webm$/i).first().locator("xpath=..").getByRole("button").click();
  const audioDialog = page.getByRole("dialog", { name: /choose how to add this media/i });
  await audioDialog.waitFor({ state: "visible", timeout: 10_000 });
  // Confirmed (not assumed) real elah defect, found by this test: elah's own clip
  // transform-handle overlay (Preview's "cursor: move" selection box around the newly
  // imported clip) renders at z-index 2000, above AudioDropDialog's z-index 1000. For a
  // wide stage (16:9) that handle box is wide enough to cover the dialog's buttons and
  // steals real mouse-coordinate clicks — even Playwright's `force: true`, since it still
  // dispatches at the button's screen coordinates and the browser's own hit-test still
  // routes to the handle on top. Dispatching the click directly on the DOM node bypasses
  // hit-testing entirely and reaches React's handler regardless of visual overlap.
  // Diagnosed live via elementFromPoint/computed z-index — not ours to patch (it's elah's
  // compiled output); see docs/ai/VIDEO_STUDIO_ELAH_CAPABILITY_MATRIX.md for the writeup.
  await audioDialog.getByRole("button", { name: /video \+ audio/i }).dispatchEvent("click");
  await expect(audioDialog).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator(".elah-root [class*='bg-clip-video']").first()).toBeVisible({ timeout: 10_000 });

  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: /export mp4/i }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("export produced no downloadable file");
  const base64 = readFileSync(path).toString("base64");

  return page.evaluate(async (b64) => {
    const video = document.createElement("video");
    video.src = `data:video/mp4;base64,${b64}`;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("browser could not decode the exported MP4"));
    });
    return { width: video.videoWidth, height: video.videoHeight };
  }, base64);
}

test.describe("Fase 0f — platform presets change the actual export", () => {
  test("9:16 preset exports at native 1080x1920", async ({ page }) => {
    test.setTimeout(90_000);
    await login(page);
    await createWithPreset(page, /9:16/);
    const dims = await addClipAndExport(page);
    expect(dims.width, "9:16 export must be narrower than tall").toBeLessThan(dims.height);
    expect(dims).toEqual({ width: 1080, height: 1920 });
  });

  test("16:9 preset exports at native 1920x1080 (not stretched/cropped to a portrait default)", async ({ page }) => {
    test.setTimeout(90_000);
    await login(page);
    await createWithPreset(page, /16:9/);
    const dims = await addClipAndExport(page);
    expect(dims.width, "16:9 export must be wider than tall").toBeGreaterThan(dims.height);
    expect(dims).toEqual({ width: 1920, height: 1080 });
  });

  test("1:1 preset exports at native 1080x1080", async ({ page }) => {
    test.setTimeout(90_000);
    await login(page);
    await createWithPreset(page, /1:1/);
    const dims = await addClipAndExport(page);
    expect(dims).toEqual({ width: 1080, height: 1080 });
  });
});
