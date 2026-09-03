/* eslint-disable @typescript-eslint/no-explicit-any */
// Shared by any edge function that executes a capability on behalf of a
// company, so the Value Engine's numbers are always real, measured
// executions — never fabricated or estimated.
export async function recordCapabilityUsage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  companyId: string,
  capabilityId: string,
  module: string,
  success: boolean,
): Promise<void> {
  const { data: existing } = await supabase
    .from("capability_usage")
    .select("id, execution_count, success_count, failure_count")
    .eq("company_id", companyId)
    .eq("capability_id", capabilityId)
    .eq("module", module)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    await supabase.from("capability_usage").update({
      execution_count: existing.execution_count + 1,
      success_count: existing.success_count + (success ? 1 : 0),
      failure_count: existing.failure_count + (success ? 0 : 1),
      last_used_at: now,
      updated_at: now,
    }).eq("id", existing.id);
    return;
  }

  await supabase.from("capability_usage").insert({
    company_id: companyId,
    capability_id: capabilityId,
    module,
    execution_count: 1,
    success_count: success ? 1 : 0,
    failure_count: success ? 0 : 1,
    last_used_at: now,
  });
}
