/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireCompanyAuth, jsonError } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { CAPABILITY_TAXONOMY, PROVIDER_CAPABILITIES, type CapabilityId } from "../_shared/integration-taxonomy.ts";

// The Integration DNA + Opportunity engine. Deterministic, rule-based, no
// LLM in this path (opportunities must be explainable and never a guess)
// — the AI Integration Advisor (separate, chat-facing) sits ON TOP of
// this and only ever cites what this engine has already computed.
//
// COMPANY -> CONNECTED TOOLS -> CAPABILITIES (workspace_capabilities) ->
// DNA (integration_dna) -> OPPORTUNITIES (integration_opportunities).
//
// recalculate() is the single entry point that keeps all three in sync.
// It is cheap (a handful of indexed queries, no external calls) and safe
// to call synchronously right after a connection changes.

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface ConnectionRow { id: string; provider: string; status: string; }
interface UsageRow { capability_id: string; module: string; execution_count: number; }

// deno-lint-ignore no-explicit-any
async function recalculate(supabase: any, companyId: string) {
  const { data: connectionsRaw } = await supabase
    .from("integrations")
    .select("id, provider, status")
    .eq("company_id", companyId);
  const connections: ConnectionRow[] = connectionsRaw ?? [];
  const connected = connections.filter((c) => c.status === "connected");

  // ─── 1. Recompute workspace_capabilities from connected providers ───
  // "connectionId" is nullable here on purpose: a native (non-Composio)
  // connection — e.g. a personal Gmail OAuth account in email_accounts —
  // has no row in `integrations` to point at, but the capability it
  // unlocks is exactly as real. Provider survives regardless of path
  // (native vs Composio), matching the no-lock-in design principle.
  const nextCapabilities = new Map<string, { capabilityId: CapabilityId; provider: string; connectionId: string | null }>();
  for (const conn of connected) {
    const caps = PROVIDER_CAPABILITIES[conn.provider] ?? [];
    for (const capId of caps) {
      nextCapabilities.set(`${capId}::${conn.provider}`, { capabilityId: capId, provider: conn.provider, connectionId: conn.id });
    }
  }

  // Native Gmail OAuth (email_accounts) bypasses the `integrations`
  // table entirely — checked here so a company using only the personal
  // connect flow still gets full DNA/opportunity credit for email.send.
  const { count: nativeGmailCount } = await supabase
    .from("email_accounts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("provider", "gmail")
    .eq("status", "connected");
  if ((nativeGmailCount ?? 0) > 0) {
    nextCapabilities.set("email.send::gmail-native", { capabilityId: "email.send", provider: "gmail-native", connectionId: null });
  }

  const { data: existingCapsRaw } = await supabase
    .from("workspace_capabilities")
    .select("id, capability_id, provider")
    .eq("company_id", companyId);
  const existingCaps: Array<{ id: string; capability_id: string; provider: string }> = existingCapsRaw ?? [];
  const existingKeys = new Set(existingCaps.map((c) => `${c.capability_id}::${c.provider}`));
  const nextKeys = new Set(nextCapabilities.keys());

  // Rows for capabilities no longer backed by a connected provider go to
  // "expired" rather than being deleted — preserves discovered_at history
  // and lets a reconnect just flip status back without losing it.
  const toExpire = existingCaps.filter((c) => !nextKeys.has(`${c.capability_id}::${c.provider}`));
  for (const row of toExpire) {
    await supabase.from("workspace_capabilities").update({ status: "expired", last_verified_at: new Date().toISOString() }).eq("id", row.id);
  }

  const toUpsert = [...nextCapabilities.entries()].filter(([key]) => !existingKeys.has(key) ||
    // also re-verify rows that existed but were expired
    existingCaps.some((c) => `${c.capability_id}::${c.provider}` === key));
  for (const [, cap] of toUpsert) {
    await supabase.from("workspace_capabilities").upsert(
      {
        company_id: companyId,
        capability_id: cap.capabilityId,
        provider: cap.provider,
        connection_id: cap.connectionId,
        status: "available",
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: "company_id,capability_id,provider" },
    );
  }

  const capabilityIds = new Set([...nextCapabilities.values()].map((c) => c.capabilityId));

  // ─── 2. Usage — what's actually being exercised ───
  const { data: usageRaw } = await supabase
    .from("capability_usage")
    .select("capability_id, module, execution_count")
    .eq("company_id", companyId);
  const usage: UsageRow[] = usageRaw ?? [];
  const usedCapabilityIds = new Set(usage.filter((u) => u.execution_count > 0).map((u) => u.capability_id));
  const unusedCapabilityIds = [...capabilityIds].filter((id) => !usedCapabilityIds.has(id));

  // ─── 3. Opportunities — deterministic rules only ───
  const has = (id: CapabilityId) => capabilityIds.has(id);
  const wasUsed = (id: CapabilityId) => usedCapabilityIds.has(id);

  type NewOpportunity = {
    type: string; title: string; description: string; reason: string;
    confidence: number; requiredCapabilities: CapabilityId[]; missingCapabilities: CapabilityId[];
    impactedModules: string[]; estimatedManualStepsRemoved: number;
  };
  const opportunities: NewOpportunity[] = [];

  if (has("ads.leads.read") && has("email.send")) {
    opportunities.push({
      type: "READY_NOW",
      title: "Automatically follow up on Meta leads",
      description: "New leads from Meta Ads can enter CRM and receive an automatic follow-up email — no manual export/import.",
      reason: "Meta Ads and an email provider are both connected, and your CRM already has an incoming-lead flow.",
      confidence: 0.9,
      requiredCapabilities: ["ads.leads.read", "email.send"],
      missingCapabilities: [],
      impactedModules: ["marketing", "leads"],
      estimatedManualStepsRemoved: 3,
    });
  } else if (has("ads.leads.read") && !has("email.send")) {
    opportunities.push({
      type: "ONE_CONNECTION_AWAY",
      title: "Connect email to auto-follow-up Meta leads",
      description: "Meta Ads is connected and importing leads, but nothing can email them automatically yet.",
      reason: "ads.leads.read is available; email.send is not.",
      confidence: 0.75,
      requiredCapabilities: ["ads.leads.read", "email.send"],
      missingCapabilities: ["email.send"],
      impactedModules: ["marketing", "leads"],
      estimatedManualStepsRemoved: 2,
    });
  }

  if (has("email.send") && has("calendar.write")) {
    opportunities.push({
      type: "READY_NOW",
      title: "Prepare a meeting booking when a lead replies",
      description: "Combine your connected email and calendar to move straight from a reply to a booked meeting.",
      reason: "email.send and calendar.write are both connected.",
      confidence: 0.8,
      requiredCapabilities: ["email.send", "calendar.write"],
      missingCapabilities: [],
      impactedModules: ["leads", "customers", "deals"],
      estimatedManualStepsRemoved: 2,
    });
  }

  if (has("payments.events") && !wasUsed("payments.events")) {
    opportunities.push({
      type: "UNUSED_CAPABILITY",
      title: "Auto-reconcile invoice payments",
      description: "Stripe payment events are available but nothing is using them yet — invoice status can update automatically the moment a payment lands.",
      reason: "payments.events is connected but has zero recorded executions.",
      confidence: 0.85,
      requiredCapabilities: ["payments.events"],
      missingCapabilities: [],
      impactedModules: ["invoices", "finance", "customers"],
      estimatedManualStepsRemoved: 4,
    });
  }

  // BROKEN_CHAIN: sales flow stops at invoice with no payment provider connected.
  const { count: invoiceCount } = await supabase.from("invoices").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  if ((invoiceCount ?? 0) > 0 && !has("payments.read") && !has("payments.events")) {
    opportunities.push({
      type: "BROKEN_CHAIN",
      title: "Connect a payment provider to close the invoice loop",
      description: "Your sales flow currently stops at invoice creation. Connecting a payment provider would let payment status return automatically to your CRM.",
      reason: `Company has ${invoiceCount} invoice(s) and no connected payment provider.`,
      confidence: 0.7,
      requiredCapabilities: ["payments.read"],
      missingCapabilities: ["payments.read"],
      impactedModules: ["invoices", "finance"],
      estimatedManualStepsRemoved: 2,
    });
  }

  if (has("email.read") && !wasUsed("email.read")) {
    opportunities.push({
      type: "UNUSED_CAPABILITY",
      title: "Sync replies into Smart Inbox",
      description: "Incoming email can be read but isn't feeding Smart Inbox or customer/lead timelines yet.",
      reason: "email.read is connected but has zero recorded executions.",
      confidence: 0.7,
      requiredCapabilities: ["email.read"],
      missingCapabilities: [],
      impactedModules: ["smart-inbox", "leads", "customers"],
      estimatedManualStepsRemoved: 2,
    });
  }

  // REDUNDANCY: two providers both connected that supply the same capability.
  const providerConnectionsByCapability = new Map<CapabilityId, string[]>();
  for (const conn of connected) {
    for (const capId of PROVIDER_CAPABILITIES[conn.provider] ?? []) {
      const list = providerConnectionsByCapability.get(capId) ?? [];
      list.push(conn.provider);
      providerConnectionsByCapability.set(capId, list);
    }
  }
  for (const [capId, providers] of providerConnectionsByCapability) {
    const unique = [...new Set(providers)];
    if (unique.length > 1) {
      opportunities.push({
        type: "REDUNDANCY",
        title: `Multiple providers connected for ${CAPABILITY_TAXONOMY[capId].name.toLowerCase()}`,
        description: `${unique.join(" and ")} are both connected and both provide "${CAPABILITY_TAXONOMY[capId].name}" — pick a default to avoid ambiguous sender/account selection.`,
        reason: `${unique.length} connected providers overlap on ${capId}.`,
        confidence: 0.6,
        requiredCapabilities: [capId],
        missingCapabilities: [],
        impactedModules: CAPABILITY_TAXONOMY[capId].compatibleModules,
        estimatedManualStepsRemoved: 0,
      });
    }
  }

  // Replace open, non-dismissed opportunities with the freshly computed
  // set. Dismissed/activated rows are left untouched (history + the
  // dismissal-suppression the product spec requires).
  const { data: existingOpenRaw } = await supabase
    .from("integration_opportunities")
    .select("id, title, status")
    .eq("company_id", companyId)
    .eq("status", "open");
  const existingOpen: Array<{ id: string; title: string }> = existingOpenRaw ?? [];
  const nextTitles = new Set(opportunities.map((o) => o.title));

  // Drop open opportunities that no longer apply (capabilities changed).
  for (const row of existingOpen) {
    if (!nextTitles.has(row.title)) {
      await supabase.from("integration_opportunities").delete().eq("id", row.id);
    }
  }

  // Check dismissed titles so we don't re-surface something the user
  // already dismissed (dismissal-suppression, not spam).
  const { data: dismissedRaw } = await supabase
    .from("integration_opportunities")
    .select("title")
    .eq("company_id", companyId)
    .eq("status", "dismissed");
  const dismissedTitles = new Set(((dismissedRaw ?? []) as Array<{ title: string }>).map((r) => r.title));

  const existingOpenTitles = new Set(existingOpen.map((r) => r.title));
  for (const opp of opportunities) {
    if (dismissedTitles.has(opp.title) || existingOpenTitles.has(opp.title)) continue;
    await supabase.from("integration_opportunities").insert({
      company_id: companyId,
      type: opp.type,
      title: opp.title,
      description: opp.description,
      reason: opp.reason,
      confidence: opp.confidence,
      status: "open",
      required_capabilities: opp.requiredCapabilities,
      missing_capabilities: opp.missingCapabilities,
      impacted_modules: opp.impactedModules,
      estimated_manual_steps_removed: opp.estimatedManualStepsRemoved,
    });
  }

  // ─── 4. DNA score ───
  // Connectivity never rewards connecting apps that don't add real
  // capability coverage: it's capped and driven by connection count, not
  // arbitrary — utilization (used/available) dominates the score.
  const capabilityCount = capabilityIds.size;
  const usedCount = [...capabilityIds].filter((id) => wasUsed(id)).length;
  const utilizationRatio = capabilityCount > 0 ? usedCount / capabilityCount : 0;
  const connectivityRatio = Math.min(connected.length / 8, 1);
  const readyCount = opportunities.filter((o) => o.type === "READY_NOW").length;
  const brokenCount = opportunities.filter((o) => o.type === "BROKEN_CHAIN").length;
  const score = Math.max(0, Math.min(100, Math.round(utilizationRatio * 60 + connectivityRatio * 30 - brokenCount * 5 + Math.min(readyCount, 2) * 2.5)));

  await supabase.from("integration_dna").upsert({
    company_id: companyId,
    score,
    connected_count: connected.length,
    capability_count: capabilityCount,
    used_capability_count: usedCount,
    unused_capability_count: unusedCapabilityIds.length,
    ready_opportunity_count: readyCount,
    broken_chain_count: brokenCount,
    needs_attention_count: connections.filter((c) => c.status === "error" || c.status === "pending").length,
    computed_at: new Date().toISOString(),
  }, { onConflict: "company_id" });

  const { data: dna } = await supabase.from("integration_dna").select("*").eq("company_id", companyId).single();
  const capabilities = [...nextCapabilities.values()].map((c) => ({ capability_id: c.capabilityId, provider: c.provider, status: "available" as const }));
  return { dna, capabilities };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ctx = await requireCompanyAuth(req);
  if (ctx instanceof Response) return ctx;
  const { supabase, user, companyId } = ctx;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body */ }
  const action = body.action as string | undefined;

  try {
    if (action === "recalculate" || action === "get-dna" || action === "get-capabilities") {
      const { dna, capabilities } = await recalculate(supabase, companyId);
      return jsonResponse({ dna, capabilities });
    }

    if (action === "list-opportunities") {
      const { data, error } = await supabase
        .from("integration_opportunities")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "open")
        .order("confidence", { ascending: false });
      if (error) throw new Error(error.message);
      return jsonResponse({ opportunities: data ?? [] });
    }

    if (action === "dismiss-opportunity") {
      const id = body.id as string;
      if (!id) throw new Error("Missing id");
      const { error } = await supabase
        .from("integration_opportunities")
        .update({ status: "dismissed", dismissed_at: new Date().toISOString(), dismissed_by: user.id })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return jsonResponse({ success: true });
    }

    if (action === "activate-opportunity") {
      // Honest bookkeeping only: this marks intent so the opportunity
      // stops resurfacing and records who/when. Real one-click automation
      // build-out (mapping + defaults + preview) is not implemented yet —
      // see docs/remediation-progress.md.
      const id = body.id as string;
      if (!id) throw new Error("Missing id");
      const { error } = await supabase
        .from("integration_opportunities")
        .update({ status: "activated", activated_at: new Date().toISOString(), activated_by: user.id })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return jsonResponse({ success: true, note: "Marked activated. Automated execution of this opportunity is not yet built." });
    }

    if (action === "module-impact-map") {
      return jsonResponse({ capabilities: CAPABILITY_TAXONOMY });
    }

    return jsonError("Unknown action", 400);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
});
