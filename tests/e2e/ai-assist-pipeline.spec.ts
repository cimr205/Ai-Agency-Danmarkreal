import { test, expect, type Page } from "@playwright/test";
import { LOCALE } from "./registry";
import { expectAppMounted } from "./helpers";

/**
 * AI-ASSISTED pipeline — backend contract verification against the deployed
 * `ai-operating-manager` edge function (propose → approve → execute → audit).
 *
 * This proves the execution layer the UI will drive: a proposed action is an
 * immutable, permission-checked, idempotent contract; approval executes it
 * exactly once through real business logic (tasks.create), writes an audit
 * trail, and is fully tenant-isolated. No model is needed for this path — only
 * the natural-language analysis needs a provider (covered separately).
 *
 * Tenant A does the full cycle; Tenant B proves isolation. Synthetic data only.
 */
const SUPABASE_URL = "https://vbxlpxhvojlaisxcipyh.supabase.co";

type Creds = { apikey: string; token: string };

function attachApikey(page: Page, ref: { value: string }) {
  page.on("request", (req) => {
    if (!ref.value && req.url().startsWith(SUPABASE_URL)) {
      const k = req.headers()["apikey"];
      if (k) ref.value = k;
    }
  });
}

async function creds(page: Page, ref: { value: string }): Promise<Creds> {
  await page.goto(`/${LOCALE}/app/crm/leads`, { waitUntil: "domcontentloaded" });
  await expectAppMounted(page);
  await expect.poll(() => ref.value, { timeout: 15_000 }).not.toBe("");
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((x) => /sb-.*-auth-token/.test(x));
    if (!key) return "";
    const v = JSON.parse(localStorage.getItem(key)!);
    return v.access_token || v?.currentSession?.access_token || "";
  });
  expect(token).not.toBe("");
  return { apikey: ref.value, token };
}

function headers(c: Creds, json = false) {
  return { apikey: c.apikey, Authorization: `Bearer ${c.token}`, ...(json ? { "Content-Type": "application/json" } : {}) };
}
async function restGet(page: Page, path: string, c: Creds) {
  const res = await page.request.get(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers(c) });
  expect(res.ok(), `GET ${path} -> ${res.status()}`).toBeTruthy();
  return res.json();
}
function om(page: Page, body: Record<string, unknown>, c: Creds) {
  return page.request.post(`${SUPABASE_URL}/functions/v1/ai-operating-manager`, { headers: headers(c, true), data: body });
}

// Shared across the two tenant describe-blocks (serial, workers=1).
const shared = { actionId: "", taskId: "", leadId: "", companyA: "", title: "" };

test.describe("Tenant A — AI-assisted action pipeline", () => {
  test.use({ storageState: "tests/e2e/.auth/tenantA.json" });
  const ref = { value: "" };
  test.beforeEach(({ page }) => attachApikey(page, ref));

  test("propose → approve executes once, persists, and is audited", async ({ page }) => {
    const c = await creds(page, ref);
    const stamp = Date.now();

    // A real lead to attach the follow-up to.
    const prof = await restGet(page, `profiles?select=company_id,user_id`, c);
    shared.companyA = prof[0].company_id;
    const leadIns = await page.request.post(`${SUPABASE_URL}/rest/v1/customers`, {
      headers: { ...headers(c, true), Prefer: "return=representation" },
      data: { company_id: prof[0].company_id, created_by: prof[0].user_id, record_type: "lead", status: "new", name: `QA AI Lead ${stamp}`, email: `qa.ai.${stamp}@example.com` },
    });
    expect(leadIns.ok(), `lead insert -> ${leadIns.status()}`).toBeTruthy();
    shared.leadId = (await leadIns.json())[0].id;

    // PROPOSE a follow-up task for the lead. (Lead creation itself fires CRM
    // automation, so we identify *this action's* task by its unique title,
    // not by lead_id.)
    const title = `Follow up QA AI ${stamp}`;
    shared.title = title;
    const proposeRes = await om(page, {
      operation: "propose",
      actionName: "tasks.create",
      input: { title, due_date: "2026-12-31", priority: "high", lead_id: shared.leadId },
      reason: "Lead has had no contact in 7 days",
    }, c);
    expect(proposeRes.status(), await proposeRes.text()).toBe(201);
    const action = (await proposeRes.json()).action;
    shared.actionId = action.id;
    expect(action.status).toBe("awaiting_approval");
    expect(action.execution_function).toBe("tasks.create");
    expect(action.risk_level).toBe("low");
    expect((action.payload as { lead_id: string }).lead_id).toBe(shared.leadId);

    // No task yet — nothing executes without approval.
    const q = `tasks?select=id,title,status,lead_id&title=eq.${encodeURIComponent(title)}`;
    let tasks = await restGet(page, q, c);
    expect(tasks.length, "no task before approval").toBe(0);

    // APPROVE → executes exactly once.
    const approveRes = await om(page, { operation: "approve", actionId: shared.actionId }, c);
    expect(approveRes.status(), await approveRes.text()).toBe(200);
    const approved = await approveRes.json();
    expect(approved.action.status).toBe("completed");
    expect(approved.action.verification?.verified).toBe(true);

    // The task now exists exactly once, linked to the lead, status pending.
    tasks = await restGet(page, q, c);
    expect(tasks.length).toBe(1);
    expect(tasks[0].status).toBe("pending");
    expect(tasks[0].lead_id).toBe(shared.leadId);
    shared.taskId = tasks[0].id;

    // Audit trail records the lifecycle.
    const audit = await restGet(page, `ai_action_audit?select=event_type&action_id=eq.${shared.actionId}&order=created_at.asc`, c);
    const events = audit.map((a: { event_type: string }) => a.event_type);
    expect(events).toContain("proposed");
    expect(events).toContain("approved");
    expect(events).toContain("completed");
  });

  test("double approval is idempotent — the task is not duplicated", async ({ page }) => {
    const c = await creds(page, ref);
    const replay = await om(page, { operation: "approve", actionId: shared.actionId }, c);
    expect(replay.status()).toBe(200);
    expect((await replay.json()).idempotentReplay).toBe(true);
    const tasks = await restGet(page, `tasks?select=id&title=eq.${encodeURIComponent(shared.title)}`, c);
    expect(tasks.length, "still exactly one task after a second approval").toBe(1);
  });

  test("a proposal with a missing required field is rejected", async ({ page }) => {
    const c = await creds(page, ref);
    const res = await om(page, { operation: "propose", actionName: "tasks.create", input: { priority: "high" } }, c);
    expect(res.status()).toBe(400);
    expect((await res.text()).toLowerCase()).toContain("title");
  });
});

test.describe("Tenant B — isolation", () => {
  test.use({ storageState: "tests/e2e/.auth/tenantB.json" });
  const ref = { value: "" };
  test.beforeEach(({ page }) => attachApikey(page, ref));

  test("cannot see or approve another tenant's action or task", async ({ page }) => {
    expect(shared.actionId, "depends on Tenant A test").not.toBe("");
    const c = await creds(page, ref);

    // RLS: B cannot read A's action or task.
    const act = await restGet(page, `autopilot_actions?select=id&id=eq.${shared.actionId}`, c);
    expect(act.length).toBe(0);
    const task = await restGet(page, `tasks?select=id&id=eq.${shared.taskId}`, c);
    expect(task.length).toBe(0);

    // The function scopes by the caller's company → A's action is "not found" for B.
    const res = await om(page, { operation: "approve", actionId: shared.actionId }, c);
    expect([403, 404]).toContain(res.status());
  });
});
