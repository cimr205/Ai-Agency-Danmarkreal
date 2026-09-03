// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { registerCoreCapabilities } from "../capabilities/core-capabilities.ts";
import { CapabilityRegistry } from "../capabilities/capability-registry.ts";
import type { ExecutionContext } from "../execution/execution.types.ts";

registerCoreCapabilities();

// §31 WRONG WORKSPACE: a lead that exists, but belongs to a different
// company than the caller's ctx.workspaceId, must be treated as not
// found — never returned. This isn't a special-cased check; it falls out
// of every capability query filtering by ctx.workspaceId, which this
// test verifies directly against crm.leads.get.
function scopedFakeDb(rows: Record<string, { id: string; company_id: string; record_type?: string }>) {
  return {
    from: (_table: string) => ({
      select: () => ({
        eq: (field: string, value: string) => {
          const filters: Record<string, string> = { [field]: value };
          const builder = {
            eq: (f2: string, v2: string) => { filters[f2] = v2; return builder; },
            maybeSingle: () => {
              const match = Object.values(rows).find((r) =>
                Object.entries(filters).every(([k, v]) => (r as any)[k] === v),
              );
              return Promise.resolve({ data: match ?? null, error: null });
            },
          };
          return builder;
        },
      }),
    }),
  };
}

Deno.test("tenant isolation: crm.leads.get never returns a lead from another workspace", async () => {
  const db = scopedFakeDb({ lead1: { id: "550e8400-e29b-41d4-a716-446655440000", company_id: "workspace-A", record_type: "lead" } });
  const ctxWrongWorkspace: ExecutionContext = { db, workspaceId: "workspace-B", userId: "u1", roles: ["employee"] as any, authHeader: "Bearer x" };
  const capability = CapabilityRegistry.get("crm.leads.get")!;
  const result = await capability.execute(ctxWrongWorkspace, { id: "550e8400-e29b-41d4-a716-446655440000" });
  assertEquals(result.success, false);
  assertEquals(result.error, "Lead not found");
});

Deno.test("tenant isolation: crm.leads.get succeeds for the correct workspace", async () => {
  const db = scopedFakeDb({ lead1: { id: "550e8400-e29b-41d4-a716-446655440000", company_id: "workspace-A", record_type: "lead" } });
  const ctxCorrectWorkspace: ExecutionContext = { db, workspaceId: "workspace-A", userId: "u1", roles: ["employee"] as any, authHeader: "Bearer x" };
  const capability = CapabilityRegistry.get("crm.leads.get")!;
  const result = await capability.execute(ctxCorrectWorkspace, { id: "550e8400-e29b-41d4-a716-446655440000" });
  assertEquals(result.success, true);
});
