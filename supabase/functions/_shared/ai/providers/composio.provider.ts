import type { IntegrationProvider, ConnectionStatus } from "./provider.types.ts";
import type { ExecutionContext } from "../execution/execution.types.ts";
import { CapabilityRegistry } from "../capabilities/capability-registry.ts";

// Which Composio-connectable provider slugs can fulfill each capability
// that supports external execution. Kept as data, not scattered through
// capability code, so adding a provider later is a one-line change here.
const CAPABILITY_PROVIDER_SLUGS: Record<string, string[]> = {
  "email.send": ["gmail", "outlook"],
  "files.search": ["notion"],
  "files.read": ["notion"],
};

async function findConnectedSlug(capabilityId: string, workspaceId: string, ctx: ExecutionContext): Promise<string | null> {
  const slugs = CAPABILITY_PROVIDER_SLUGS[capabilityId];
  if (!slugs?.length) return null;
  const { data } = await ctx.db.from("integrations").select("provider").eq("company_id", workspaceId).eq("status", "connected").in("provider", slugs).limit(1).maybeSingle();
  return data?.provider ?? null;
}

export const ComposioProvider: IntegrationProvider = {
  name: "composio",

  async canExecute(capabilityId: string, workspaceId: string, ctx: ExecutionContext): Promise<boolean> {
    return (await findConnectedSlug(capabilityId, workspaceId, ctx)) !== null;
  },

  execute(capabilityId: string, ctx: ExecutionContext, input: unknown): Promise<unknown> {
    // Capabilities that support a Composio path already know how to use
    // it themselves (e.g. email.send → gmail-send, which has its own
    // Composio fallback) — this provider's job is connection resolution
    // and reporting, not re-implementing each capability's execution.
    const capability = CapabilityRegistry.get(capabilityId);
    if (!capability) throw new Error(`Unknown capability: ${capabilityId}`);
    return capability.execute(ctx, input);
  },

  async getConnectionStatus(capabilityId: string, workspaceId: string, ctx: ExecutionContext): Promise<ConnectionStatus> {
    const slug = await findConnectedSlug(capabilityId, workspaceId, ctx);
    if (!slug) return { connected: false };
    const { data } = await ctx.db.from("integrations").select("account_label").eq("company_id", workspaceId).eq("provider", slug).maybeSingle();
    return { connected: true, accountLabel: data?.account_label ?? slug };
  },
};

export function composioProviderSlugs(capabilityId: string): string[] {
  return CAPABILITY_PROVIDER_SLUGS[capabilityId] ?? [];
}
