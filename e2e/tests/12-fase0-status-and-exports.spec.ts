import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { loadTenants, serviceSelect } from "../support/testProject.ts";

const TEST_VIDEO = fileURLToPath(new URL("../fixtures/test-video-with-audio.webm", import.meta.url));

/**
 * Fase 0e proof: status only ever moved draft -> exported (never 'exporting' while
 * rendering, never 'failed' on error — masterprompt gap #3), and a finished export was
 * unreachable afterward. This verifies the real status transition and that the project
 * list's new "download last export" action produces a working, fetchable file.
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

test.describe("Fase 0e — status tracking and reachable exports", () => {
  test("export moves status to 'exported' with a real path, and the list's download action opens a working file", async ({ page }) => {
    test.setTimeout(90_000);
    const { tenants } = loadTenants();
    const companyId = tenants.a.companyId;
    const uniqueName = `e2e-fase0e-${Date.now()}`;

    await loginAndOpenNewProject(page);
    await page.locator('input[type="file"]').setInputFiles(TEST_VIDEO);
    await expect(page.getByText(/\.webm$/i).first()).toBeVisible({ timeout: 20_000 });
    await page.getByText(/\.webm$/i).first().locator("xpath=..").getByRole("button").click();
    const audioDialog = page.getByRole("dialog", { name: /choose how to add this media/i });
    await audioDialog.waitFor({ state: "visible", timeout: 10_000 });
    await audioDialog.getByRole("button", { name: /video \+ audio/i }).click();
    await expect(audioDialog).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator(".elah-root [class*='bg-clip-video']").first()).toBeVisible({ timeout: 10_000 });
    await page.getByPlaceholder(/untitled video/i).fill(uniqueName);

    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: /export mp4/i }).click();
    await downloadPromise;
    await expect(page.getByText(/video exported/i)).toBeVisible({ timeout: 5_000 });

    const [row] = await serviceSelect(
      "video_projects",
      `company_id=eq.${companyId}&name=eq.${uniqueName}&select=status,exported_video_path,exported_at`,
    );
    expect(row, "project row must exist after export").toBeTruthy();
    expect(row.status, "status must move to 'exported', not stay 'draft'").toBe("exported");
    expect(row.exported_video_path, "exported_video_path must be set").toBeTruthy();
    expect(row.exported_at, "exported_at must be set").toBeTruthy();

    // Back to the list — the card must show the Exported badge and a working download
    // action (the export was previously unreachable after the fact, per masterprompt gap #3).
    await page.goto("/en/app/marketing/video-studio");
    await page.getByText(uniqueName).waitFor({ state: "visible", timeout: 15_000 });
    const card = page.locator("div.cursor-pointer", { has: page.getByText(uniqueName, { exact: true }) }).first();
    await expect(card.getByText(/exported/i)).toBeVisible();

    const downloadButton = card.getByRole("button").first();
    const [newPage] = await Promise.all([
      page.context().waitForEvent("page"),
      downloadButton.click(),
    ]);
    await newPage.waitForLoadState();
    const resp = await newPage.request.get(newPage.url());
    expect(resp.ok(), "the re-signed export URL opened from the list must actually be fetchable").toBeTruthy();
    const contentType = resp.headers()["content-type"] ?? "";
    expect(contentType, "download must serve the exported MP4, not an error page").toContain("video");
    await newPage.close();
  });
});
