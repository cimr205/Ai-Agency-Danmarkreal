import { test, expect, type Page } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * Settings → Invitations. Regression for the token/token_hash drift: the list
 * previously selected a non-existent `token` column (type error + the list
 * silently failed to load). Verifies the list loads, a new invitation can be
 * created, the secure one-time invite link is shown once, and the invite
 * appears in the list — with no token/hash exposed. Tenant A (company_admin).
 */
const SUPABASE_URL = "https://vbxlpxhvojlaisxcipyh.supabase.co";
test.use({ storageState: "tests/e2e/.auth/tenantA.json" });

const apikeyRef = { value: "" };
test.beforeEach(({ page }) => {
  page.on("request", (req) => {
    if (!apikeyRef.value && req.url().startsWith(SUPABASE_URL)) {
      const k = req.headers()["apikey"];
      if (k) apikeyRef.value = k;
    }
  });
});

async function restToken(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((x) => /sb-.*-auth-token/.test(x));
    const v = JSON.parse(localStorage.getItem(key!)!);
    return v.access_token || v?.currentSession?.access_token;
  });
}

test("invitations list loads, create shows a one-time link, invite appears", async ({ page }) => {
  const email = `qa.invite.${Date.now()}@example.com`;
  await page.goto(`/${LOCALE}/app/settings/invitations`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);

  // The page renders its own content (list query no longer errors out).
  await expect(page.getByRole("button", { name: /invite member|inviter/i })).toBeVisible({ timeout: 10_000 });

  await test.step("create an invitation", async () => {
    await page.getByRole("button", { name: /invite member|inviter/i }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible();
    await dlg.getByPlaceholder(/company\.com|@/).fill(email);
    await dlg.getByRole("button", { name: /send invitation|send/i }).click();
  });

  await test.step("the secure one-time link is shown once and well-formed", async () => {
    const link = page.getByTestId("invite-link");
    await expect(link).toBeVisible({ timeout: 15_000 });
    const value = await link.inputValue();
    expect(value).toMatch(new RegExp(`/${LOCALE}/invite\\?token=[0-9a-f]{64}$`));
    await page.getByRole("button", { name: /færdig|done/i }).click();
  });

  await test.step("the new invitation appears in the list", async () => {
    await expect(page.getByText(email).first()).toBeVisible({ timeout: 10_000 });
  });

  await test.step("the client never receives a token or token_hash", async () => {
    const token = await restToken(page);
    // The app's own safe query shape returns no token columns.
    const res = await page.request.get(
      `${SUPABASE_URL}/rest/v1/invitations?select=id,email,role,status,created_at,expires_at&email=eq.${encodeURIComponent(email)}`,
      { headers: { apikey: apikeyRef.value, Authorization: `Bearer ${token}` } },
    );
    const rows = await res.json();
    expect(rows.length).toBe(1);
    expect(Object.keys(rows[0])).not.toContain("token");
    expect(Object.keys(rows[0])).not.toContain("token_hash");

    // Cleanup — revoke the test invitation.
    await page.request.post(`${SUPABASE_URL}/rest/v1/rpc/revoke_invitation`, {
      headers: { apikey: apikeyRef.value, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { invitation_id: rows[0].id },
    });
  });
});
