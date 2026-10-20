import { test, expect } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * QA-001 regression — Stored XSS in the email viewer.
 *
 * The email body is attacker-controlled (synced from Gmail) and was previously
 * injected with dangerouslySetInnerHTML. The fix renders it inside a
 * `<iframe sandbox="" srcDoc={body_html}>`: an empty sandbox withholds BOTH
 * allow-scripts (scripts + inline handlers cannot run) and allow-same-origin
 * (even if a script ran, it is in an opaque origin with no access to the parent
 * session). This test drives the REAL EmailsPage with a hostile body and proves:
 *   1. inline <script> does not execute,
 *   2. an <img onerror> handler does not execute,
 *   3. the parent DOM / window / document.title cannot be reached,
 *   4. the Supabase session in localStorage cannot be read or overwritten,
 *   5. legitimate HTML email content still renders.
 *
 * No production data is touched: the email-account and emails queries are
 * intercepted and fulfilled with synthetic responses. Tenant A session only.
 */
test.use({ storageState: "tests/e2e/.auth/tenantA.json" });
test.setTimeout(60_000);

const SUBJECT = "QA-001 XSS probe email";
const LEGIT_MARKER = "LEGIT_EMAIL_CONTENT_XSSCANARY";

// Hostile email body. If the sandbox failed, any of these would fire and leave a
// detectable trace in the parent window or in the iframe's own DOM.
const MALICIOUS_BODY = `<!doctype html><html><head><title>evil</title></head><body>
  <h1 id="legit">${LEGIT_MARKER}</h1>
  <p>Hello from a legitimate email with <b>bold</b> and an <a href="https://example.com">link</a>.</p>
  <img id="evil-img" src="x" onerror="document.body.insertAdjacentHTML('beforeend','<div id=onerror-ran></div>');try{window.parent.__xss_onerror=1;window.parent.localStorage.setItem('xss-stolen','1');window.parent.document.title='HACKED';}catch(e){}">
  <script>
    document.body.insertAdjacentHTML('beforeend','<div id=script-ran></div>');
    try{window.parent.__xss_script=1;window.parent.localStorage.setItem('xss-stolen','1');window.parent.document.title='HACKED';}catch(e){}
  </script>
</body></html>`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() })); } catch { /* ignore */ }
  });

  // Appear "connected" so the inbox (not the connect-Gmail gate) renders.
  await page.route("**/rest/v1/email_accounts?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "00000000-0000-0000-0000-0000000000ea",
        user_id: "qa",
        provider: "gmail",
        status: "connected",
        email_address: "qa.inbox@example.com",
        last_synced_at: new Date().toISOString(),
      }),
    }),
  );

  // One synthetic inbound email carrying the hostile body.
  await page.route("**/rest/v1/emails?*", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "00000000-0000-0000-0000-0000000000e1",
          user_id: "qa",
          direction: "inbound",
          subject: SUBJECT,
          from_name: "Mallory Attacker",
          from_address: "mallory@evil.example",
          received_at: new Date().toISOString(),
          snippet: "probe",
          body_text: "probe",
          body_html: MALICIOUS_BODY,
          is_read: true,
          is_starred: false,
          ai_priority: null,
          ai_suggested_todo: null,
          thread_id: null,
          gmail_id: "g1",
          message_id_header: "<g1@evil.example>",
          customers: null,
          deals: null,
        },
      ]),
    });
  });
});

test("email viewer sandboxes hostile HTML: no script, no parent access, no session theft", async ({ page }) => {
  await page.goto(`/${LOCALE}/app/email/emails`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);

  // Open the hostile email.
  await page.getByText(SUBJECT).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const frame = dialog.locator('iframe[title="email-body"]');
  await expect(frame).toBeVisible({ timeout: 10_000 });

  // (a) The iframe is maximally sandboxed: empty sandbox token, no allow-scripts/same-origin.
  const sandboxAttr = await frame.getAttribute("sandbox");
  expect(sandboxAttr, "iframe must carry an empty sandbox attribute").toBe("");

  // Give any (blocked) script/onerror ample time to have fired.
  await page.waitForTimeout(1500);

  // (b) Legitimate content rendered inside the sandboxed frame.
  const inner = page.frameLocator('iframe[title="email-body"]');
  await expect(inner.locator("#legit")).toHaveText(LEGIT_MARKER);

  // (c) Neither the inline <script> nor the <img onerror> executed inside the frame.
  await expect(inner.locator("#script-ran")).toHaveCount(0);
  await expect(inner.locator("#onerror-ran")).toHaveCount(0);

  // (d) Parent window/document were never reached, and the session was not stolen.
  const parent = await page.evaluate(() => ({
    xssScript: (window as unknown as Record<string, unknown>).__xss_script ?? null,
    xssOnError: (window as unknown as Record<string, unknown>).__xss_onerror ?? null,
    stolen: localStorage.getItem("xss-stolen"),
    title: document.title,
    hasSession: Object.keys(localStorage).some((k) => /sb-.*-auth-token/.test(k)),
  }));
  expect(parent.xssScript, "inline script must not reach parent window").toBeNull();
  expect(parent.xssOnError, "img onerror must not reach parent window").toBeNull();
  expect(parent.stolen, "attacker must not write to parent localStorage").toBeNull();
  expect(parent.title, "attacker must not rewrite the document title").not.toBe("HACKED");
  expect(parent.hasSession, "the real Supabase session must still be present (test was genuinely authed)").toBe(true);
});
