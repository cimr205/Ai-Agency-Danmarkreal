/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { registerCoreCapabilities } from "../capabilities/core-capabilities.ts";
import { CapabilityRegistry } from "../capabilities/capability-registry.ts";
import type { ExecutionContext } from "../execution/execution.types.ts";

registerCoreCapabilities();

// The AI Integration Advisor must answer "what can I automate?" from the
// exact same rows the Integration Centre's "Your Business" panel shows —
// never invent an opportunity or a DNA number. These capabilities are
// pure reads against integration_dna/integration_opportunities.
function fakeDb(dnaRow: unknown, opportunityRows: unknown[]) {
  return {
    from: (table: string) => {
      if (table === "integration_dna") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: dnaRow, error: null }) }) }) };
      }
      if (table === "integration_opportunities") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: opportunityRows, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  };
}

function ctxWith(db: unknown): ExecutionContext {
  return { db, workspaceId: "workspace-1", userId: "user-1", roles: ["employee"] as any, authHeader: "Bearer test" };
}

Deno.test("integrations.dna.read: returns the real DNA snapshot for the workspace", async () => {
  const capability = CapabilityRegistry.get("integrations.dna.read")!;
  const dnaRow = { score: 42, connected_count: 3, capability_count: 6, used_capability_count: 2 };
  const result = await capability.execute(ctxWith(fakeDb(dnaRow, [])), {});
  assertEquals(result.success, true);
  assertEquals((result as { data: typeof dnaRow }).data.score, 42);
});

Deno.test("integrations.dna.read: never fabricates a score when nothing has been computed yet", async () => {
  const capability = CapabilityRegistry.get("integrations.dna.read")!;
  const result = await capability.execute(ctxWith(fakeDb(null, [])), {});
  assertEquals(result.success, true);
  const data = (result as { data: { score: number; note?: string } }).data;
  assertEquals(data.score, 0);
  assertEquals(typeof data.note, "string");
});

Deno.test("integrations.opportunities.read: returns only real, open opportunities", async () => {
  const capability = CapabilityRegistry.get("integrations.opportunities.read")!;
  const rows = [{ type: "READY_NOW", title: "Automatically follow up on Meta leads", confidence: 0.9 }];
  const result = await capability.execute(ctxWith(fakeDb(null, rows)), {});
  assertEquals(result.success, true);
  assertEquals((result as { data: typeof rows }).data, rows);
});
