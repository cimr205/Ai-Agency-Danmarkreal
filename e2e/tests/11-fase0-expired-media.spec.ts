import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { loadTenants, serviceSelect, serviceUpdate, serviceSignStorageUrl } from "../support/testProject.ts";

const TEST_VIDEO = fileURLToPath(new URL("../fixtures/test-video-with-audio.webm", import.meta.url));
const BUCKET = "video-assets";

/**
 * Fase 0c proof: `project_json` stores elah's raw signed media URLs (confirmed by reading
 * @elah/core's serializeProject + @elah/timeline's insertAsset source — Clip.src is the exact
 * URL handed to importUrl()). Those signed URLs expire after 24h; opening a saved project must
 * still work by re-signing from the storage path before deserializeProject() runs
 * (resignProjectMedia() in useVideoStudio.ts). Waiting 24h isn't practical in CI, so this test
 * mints an already-expired signed URL (expiresIn: 1s + a 2s wait) and injects it directly into
 * the saved row via the service-role REST API, simulating ">24h old" deterministically.
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
  await expect(page.locator(".elah-root canvas").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("Fase 0c — project survives expired media URLs", () => {
  test("a project saved with a video clip reopens and exports after its stored URL has expired", async ({ page }) => {
    test.setTimeout(120_000);
    const { tenants } = loadTenants();
    const companyId = tenants.a.companyId;

    await loginAndOpenNewProject(page);

    // 1) Upload and place a real video clip, then save — persists project_json with a
    //    (currently valid, 24h) signed URL in clip.src.
    await page.locator('input[type="file"]').setInputFiles(TEST_VIDEO);
    await expect(page.getByText(/\.webm$/i).first()).toBeVisible({ timeout: 20_000 });
    await page.getByText(/\.webm$/i).first().locator("xpath=..").getByRole("button").click();
    const audioDialog = page.getByRole("dialog", { name: /choose how to add this media/i });
    await audioDialog.waitFor({ state: "visible", timeout: 10_000 });
    await audioDialog.getByRole("button", { name: /video \+ audio/i }).click();
    await expect(audioDialog).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator(".elah-root [class*='bg-clip-video']").first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(/project saved/i)).toBeVisible({ timeout: 10_000 });

    const projectIdMatch = page.url().match(/[0-9a-f-]{36}/);
    const [row] = await serviceSelect(
      "video_projects",
      `company_id=eq.${companyId}&select=id,project_json&order=updated_at.desc&limit=1`,
    );
    expect(row, "saved project row must exist").toBeTruthy();
    const projectId = projectIdMatch?.[0] ?? row.id;

    // 2) Find the stored clip's storage path from its (still-valid) signed URL, then mint an
    //    ALREADY-EXPIRED signed URL for that same path and overwrite the row directly — this
    //    is the deterministic stand-in for ">24h later".
    const clipsByTrack = row.project_json.clips as Record<string, Array<Record<string, unknown>>>;
    let storagePath: string | null = null;
    for (const bucket of Object.values(clipsByTrack)) {
      for (const clip of bucket) {
        const src = clip.src as string | undefined;
        const marker = `/storage/v1/object/sign/${BUCKET}/`;
        if (src?.includes(marker)) {
          storagePath = decodeURIComponent(src.split(marker)[1].split("?")[0]);
          break;
        }
      }
      if (storagePath) break;
    }
    expect(storagePath, "a video clip with a signed-URL src must be present in project_json").toBeTruthy();

    const expiredUrl = await serviceSignStorageUrl(BUCKET, storagePath!, 1);
    await page.waitForTimeout(2_000); // let the 1s token actually expire

    const expiredProjectJson = JSON.parse(JSON.stringify(row.project_json));
    for (const bucket of Object.values(expiredProjectJson.clips as Record<string, Array<Record<string, unknown>>>)) {
      for (const clip of bucket) {
        if ((clip.src as string | undefined)?.includes(`/storage/v1/object/sign/${BUCKET}/`)) {
          clip.src = expiredUrl;
        }
      }
    }
    await serviceUpdate("video_projects", `id=eq.${projectId}`, { project_json: expiredProjectJson });

    // Sanity: confirm the token we just injected is actually dead before testing the fix.
    const directFetch = await page.request.get(expiredUrl);
    expect(directFetch.ok(), "the injected URL must genuinely be expired").toBeFalsy();

    // 3) Reopen the project fresh (back to list, then back in) — this re-runs the load effect,
    //    which must re-sign media before deserializeProject() or the clip would stay broken.
    const consoleErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await page.goto("/en/app/marketing/video-studio");
    await page.getByText(/video studio/i).first().waitFor({ state: "visible", timeout: 15_000 });
    await page.reload();
    await page.getByText(/video studio/i).first().waitFor({ state: "visible", timeout: 15_000 });
    await page.locator("div.cursor-pointer").first().click();
    await expect(page.locator(".elah-root canvas").first()).toBeVisible({ timeout: 20_000 });

    await expect(page.getByText(/could not load project/i)).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator(".elah-root [class*='bg-clip-video']").first()).toBeVisible({ timeout: 10_000 });

    // 4) The real proof: export must still produce a real file, not a blank/broken render,
    //    which only works if the clip's media actually loaded from the re-signed URL.
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: /export mp4/i }).click();
    const download = await downloadPromise;
    const dlPath = await download.path();
    const fs = await import("node:fs");
    const bytes = dlPath ? fs.statSync(dlPath).size : 0;
    expect(bytes, "export after expired-URL recovery must contain real encoded content").toBeGreaterThan(50_000);

    const seriousErrors = consoleErrors.filter((e) => !/favicon|ResizeObserver|Download the React DevTools/i.test(e));
    expect(seriousErrors, `console errors: ${JSON.stringify(seriousErrors)}`).toEqual([]);
  });
});
