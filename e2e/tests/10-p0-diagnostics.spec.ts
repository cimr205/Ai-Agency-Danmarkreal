import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { loadTenants } from "../support/testProject.ts";

const TEST_VIDEO = fileURLToPath(new URL("../fixtures/test-video-with-audio.webm", import.meta.url));
const CORRUPT_FILE = fileURLToPath(new URL("../fixtures/corrupt-fake.mp4", import.meta.url));

/**
 * P0 regression suite — the minimum bar for calling Video Studio "an editor"
 * rather than a demo. Each test here was written against a REAL, previously
 * discovered gap or behavior, verified live, not assumed from elah's docs.
 */

async function loginAndOpenNewProject(page: import("@playwright/test").Page) {
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
  await page.getByRole("button", { name: /new video/i }).first().click();
  await page.getByRole("menuitem", { name: /9:16/ }).click();
  await expect(page.locator(".elah-root canvas").first()).toBeVisible({ timeout: 20_000 });
}

/** Uploads TEST_VIDEO, adds it to the timeline, and resolves elah's real
 * "video has audio" dialog by choosing "Video + Audio". Returns once a clip
 * is actually on the video track. */
async function uploadVideoAndPlaceOnTimeline(page: import("@playwright/test").Page) {
  await page.locator('input[type="file"]').setInputFiles(TEST_VIDEO);
  await expect(page.getByText(/\.webm$/i).first()).toBeVisible({ timeout: 20_000 });
  await page.getByText(/\.webm$/i).first().locator("xpath=..").getByRole("button").click();

  const audioDialog = page.getByRole("dialog", { name: /choose how to add this media/i });
  // locator.isVisible() checks current DOM state immediately and does not poll —
  // use waitFor() for an actually-retrying check (this dialog renders asynchronously
  // after media probing, so a point-in-time check flakes).
  await audioDialog.waitFor({ state: "visible", timeout: 10_000 });
  await audioDialog.getByRole("button", { name: /video \+ audio/i }).click();
  await expect(audioDialog).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator(".elah-root [class*='bg-clip-video']").first()).toBeVisible({ timeout: 10_000 });
}

test.describe("P0 — minimum editor bar", () => {
  test("P0-1 & P0-4: real video+audio uploads, decodes, places on both tracks, and exports with both streams", async ({ page }) => {
    test.setTimeout(90_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await loginAndOpenNewProject(page);
    await uploadVideoAndPlaceOnTimeline(page);

    // Both the video AND audio tracks must have a clip (not just video).
    await expect(page.locator(".elah-root [class*='bg-clip-video']").first()).toBeVisible();
    await expect(page.locator(".elah-root [class*='bg-clip-audio']").first()).toBeVisible();

    const seriousErrors = consoleErrors.filter((e) => !/favicon|ResizeObserver|Download the React DevTools/i.test(e));
    expect(seriousErrors, `console errors: ${JSON.stringify(seriousErrors)}`).toEqual([]);

    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: /export mp4/i }).click();
    const download = await downloadPromise;
    const dlPath = await download.path();
    const fs = await import("node:fs");
    const bytes = dlPath ? fs.statSync(dlPath).size : 0;
    // The image-only export (no audio) was ~14KB; a real 2s video+audio export
    // must be substantially larger, or audio/video encoding silently dropped.
    expect(bytes, "video+audio export must contain real encoded content").toBeGreaterThan(50_000);
    await expect(page.getByText(/video exported/i)).toBeVisible({ timeout: 5_000 });
  });

  test("P0-2 & P0-3: dragging a clip actually moves it, and dragging its edge actually trims it", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAndOpenNewProject(page);
    await uploadVideoAndPlaceOnTimeline(page);

    const clip = page.locator(".elah-root [class*='bg-clip-video']").first();
    const before = await clip.boundingBox();
    expect(before, "clip must have a real bounding box before dragging").not.toBeNull();

    // P0-3: drag the clip body to move it along the timeline.
    await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
    await page.mouse.down();
    await page.mouse.move(before!.x + before!.width / 2 + 80, before!.y + before!.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const afterMove = await page.locator(".elah-root [class*='bg-clip-video']").first().boundingBox();
    expect(afterMove, "clip must still be visible after dragging").not.toBeNull();
    expect(Math.abs(afterMove!.x - before!.x), "dragging the clip body must change its position").toBeGreaterThan(5);

    // P0-2: drag the clip's right edge inward to trim its duration.
    const rightEdgeX = afterMove!.x + afterMove!.width - 2;
    const midY = afterMove!.y + afterMove!.height / 2;
    await page.mouse.move(rightEdgeX, midY);
    await page.mouse.down();
    await page.mouse.move(rightEdgeX - 60, midY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const afterTrim = await page.locator(".elah-root [class*='bg-clip-video']").first().boundingBox();
    expect(afterTrim, "clip must still be visible after trimming").not.toBeNull();
    expect(Math.abs(afterTrim!.width - afterMove!.width), "dragging the right edge must change clip width").toBeGreaterThan(5);
  });

  test("P0-5a: an oversized file is rejected with a visible error, not silently dropped", async ({ page }) => {
    await loginAndOpenNewProject(page);
    // Build a File with a real-but-tiny buffer and an overridden `.size` so the
    // app's own pre-upload size check is exercised without allocating 500MB
    // inside the Playwright browser process.
    await page.evaluate(() => {
      const file = new File([new Uint8Array(1)], "huge-video.mp4", { type: "video/mp4" });
      Object.defineProperty(file, "size", { value: 501 * 1024 * 1024 });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page.getByText(/file too large/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("huge-video.mp4")).toHaveCount(0);
  });

  test("P0-5b: a corrupt/fake media file never crashes the app and fails with a clear message", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await loginAndOpenNewProject(page);
    await page.locator('input[type="file"]').setInputFiles(CORRUPT_FILE);
    // A plain-text file with a spoofed .mp4 name passes MIME/size checks (the
    // browser reports type "video/mp4" from the extension) and uploads — real
    // content validation only happens when elah tries to decode it, which is
    // the moment it's added to the timeline, not at upload time. Document this
    // honestly as the current behavior rather than assume earlier validation.
    await expect(page.getByText("corrupt-fake.mp4")).toBeVisible({ timeout: 10_000 });

    await page.getByText("corrupt-fake.mp4").locator("xpath=..").getByRole("button").click();
    await expect(page.getByText(/failed to load video metadata/i)).toBeVisible({ timeout: 10_000 });

    // App must remain fully responsive — no white-screen crash, no uncaught exception.
    await expect(page.locator(".elah-root")).toBeVisible();
    const seriousErrors = consoleErrors.filter((e) => !/favicon|ResizeObserver|Download the React DevTools/i.test(e));
    expect(seriousErrors, `a handled decode failure must not also throw uncaught errors: ${JSON.stringify(seriousErrors)}`).toEqual([]);
  });
});
