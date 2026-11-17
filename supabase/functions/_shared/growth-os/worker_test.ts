import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { NotInstalledError, runLoop, workOne, type WorkerDeps, type WorkerStatus } from "./worker.ts";
import type { RunResult } from "./engine.ts";

// A stand-in for the supabase-js client: records rpc/insert calls, returns scripted claims.
function fakeDb(claims: Array<{ data?: unknown; error?: { message: string; code?: string } }>) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const db = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "growth_claim_task") { const c = claims.shift() ?? { data: [] }; return Promise.resolve({ data: c.data ?? null, error: c.error ?? null }); }
      return Promise.resolve({ data: true, error: null });
    },
    from(table: string) { return { insert(row: Record<string, unknown>) { inserts.push({ table, row }); return Promise.resolve({ data: null, error: null }); } }; },
  };
  // deno-lint-ignore no-explicit-any
  return { db: db as any, calls, inserts };
}

const row = { id: "t1", company_id: "c1", agent_id: "seo-agent", type: "seo.onpage_audit", input: { url: "https://example.com/" }, budget_usd: 0.05 };
const fakeResult = (status: string) => ({ report: { status }, verification: { status: "verified" }, ceo: null }) as unknown as RunResult;

function deps(db: WorkerDeps["db"], run?: WorkerDeps["run"]): WorkerDeps {
  return { db, worker: "w-test", leaseSeconds: 180, gateway: () => null, run, sleep: () => Promise.resolve() };
}

Deno.test("empty queue returns null and runs nothing (IDLE)", async () => {
  const f = fakeDb([{ data: [] }]);
  let ran = false;
  assertEquals(await workOne(deps(f.db, () => { ran = true; return Promise.resolve(fakeResult("completed")); })), null);
  assert(!ran);
  assertEquals(f.calls.map((c) => c.fn), ["growth_claim_task"]);
});

Deno.test("missing migration is reported as NotInstalledError, not as an empty queue", async () => {
  const f = fakeDb([{ error: { message: "Could not find the function public.growth_claim_task", code: "PGRST202" } }]);
  await assertRejects(() => workOne(deps(f.db)), NotInstalledError);
});

Deno.test("a claimed task is run and finished with report + verification, under this worker's lease", async () => {
  const f = fakeDb([{ data: [row] }]);
  const r = await workOne(deps(f.db, (task) => { assertEquals(task.companyId, "c1"); return Promise.resolve(fakeResult("completed")); }));
  assertEquals(r, { task_id: "t1", status: "completed", lease_kept: true });
  const finish = f.calls.find((c) => c.fn === "growth_finish_task")!;
  assertEquals(finish.args._worker, "w-test");
  assertEquals(finish.args._status, "completed");
  assertEquals((finish.args._result as { verification: { status: string } }).verification.status, "verified");
  assertEquals(f.inserts[0].row.company_id, "c1");
  assertEquals(f.inserts[0].row.event, "task.finished");
});

Deno.test("an engine error finishes the task as failed (blocked for no executor) and is audited", async () => {
  const f = fakeDb([{ data: [row] }, { data: [row] }]);
  const r = await workOne(deps(f.db, () => Promise.reject(new Error("boom"))));
  assertEquals(r?.status, "failed");
  await workOne(deps(f.db, () => Promise.reject(new Error("no executor for x"))));
  const statuses = f.calls.filter((c) => c.fn === "growth_finish_task").map((c) => c.args._status);
  assertEquals(statuses, ["failed", "blocked"]);
  assertEquals(f.inserts.map((i) => i.row.event), ["task.error", "task.error"]);
});

function freshStatus(): WorkerStatus {
  return { state: "starting", worker: "w-test", started_at: "", last_poll_at: null, tasks_processed: 0, last_task: null, last_error: null };
}

Deno.test("loop drains queued work back-to-back, then idles until stopped", async () => {
  const f = fakeDb([{ data: [row] }, { data: [{ ...row, id: "t2" }] }, { data: [] }]);
  const status = freshStatus();
  const ac = new AbortController();
  const loop = runLoop(deps(f.db, () => Promise.resolve(fakeResult("completed"))), { pollMs: 10_000, maxBackoffMs: 60_000, signal: ac.signal, status });
  await new Promise((r) => setTimeout(r, 20));
  assertEquals(status.state, "idle");
  assertEquals(status.tasks_processed, 2);
  ac.abort();
  await loop; // abort wakes the sleep immediately
  assertEquals(status.state, "stopping");
});

Deno.test("loop survives a missing schema and reports not_installed", async () => {
  const f = fakeDb([{ error: { message: "relation \"growth_tasks\" does not exist", code: "42P01" } }]);
  const status = freshStatus();
  const ac = new AbortController();
  const loop = runLoop(deps(f.db), { pollMs: 10_000, maxBackoffMs: 60_000, signal: ac.signal, status });
  await new Promise((r) => setTimeout(r, 20));
  assertEquals(status.state, "not_installed");
  assert(status.last_error?.includes("does not exist"));
  ac.abort();
  await loop;
});
