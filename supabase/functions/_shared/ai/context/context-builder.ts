import type { Domain } from "../router/request-router.ts";
import type { ExecutionContext } from "../execution/execution.types.ts";

/**
 * Fetches ONLY what's relevant to the routed domain — never a dump of
 * every deal/invoice/employee/campaign in the workspace (§T). This is
 * advisory context for the planner prompt, not authorization data; every
 * capability still re-scopes its own queries by workspaceId regardless
 * of what's summarized here.
 */
export async function buildDomainContext(domain: Domain, ctx: ExecutionContext): Promise<Record<string, unknown>> {
  switch (domain) {
    case "email": {
      const [personal, composio] = await Promise.all([
        ctx.db.from("email_accounts").select("email_address").eq("user_id", ctx.userId).eq("provider", "gmail").eq("status", "connected").maybeSingle(),
        ctx.db.from("integrations").select("provider").eq("company_id", ctx.workspaceId).eq("status", "connected").in("provider", ["gmail", "outlook"]).maybeSingle(),
      ]);
      return { emailConnected: !!(personal.data || composio.data) };
    }
    case "calendar": {
      const { count } = await ctx.db.from("calendar_events").select("id", { count: "exact", head: true }).eq("company_id", ctx.workspaceId).gte("start_time", new Date().toISOString());
      return { upcomingEventCount: count ?? 0 };
    }
    case "crm": {
      const { count } = await ctx.db.from("customers").select("id", { count: "exact", head: true }).eq("company_id", ctx.workspaceId).eq("record_type", "lead");
      return { openLeadCount: count ?? 0 };
    }
    default:
      return {};
  }
}
