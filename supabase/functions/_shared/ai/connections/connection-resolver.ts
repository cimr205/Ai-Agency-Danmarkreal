import type { Capability } from "../capabilities/capability.types.ts";
import type { ExecutionContext } from "../execution/execution.types.ts";
import { NativeProvider } from "../providers/native.provider.ts";
import { ComposioProvider, composioProviderSlugs } from "../providers/composio.provider.ts";

export type ResolvedConnection =
  | { status: "resolved"; provider: "native" | "composio" }
  | { status: "requires_connection"; capability: string; availableProviders: string[] };

// The AI never thinks "Gmail" as its first abstraction — it thinks
// "email.send" and asks: which provider in this workspace can actually
// do that? Checks native first (a personal Gmail OAuth account, when the
// capability supports it), then Composio-connected alternatives.
export async function resolveConnection(capability: Capability, ctx: ExecutionContext): Promise<ResolvedConnection> {
  if (!capability.supportedProviders.includes("composio") && !capability.supportedProviders.includes("native")) {
    return { status: "resolved", provider: "native" };
  }

  if (capability.supportedProviders.includes("native")) {
    // Native-only capabilities (internal DB writes/reads) are always
    // available. For email.send specifically, "native" here really means
    // "gmail-send will resolve the right account itself" — checked via
    // its own email_accounts-or-Composio fallback, not duplicated here.
    if (capability.id === "email.send") {
      const { data: personal } = await ctx.db.from("email_accounts").select("id").eq("user_id", ctx.userId).eq("provider", "gmail").eq("status", "connected").maybeSingle();
      if (personal) return { status: "resolved", provider: "native" };
    } else {
      return { status: "resolved", provider: "native" };
    }
  }

  if (capability.supportedProviders.includes("composio")) {
    const connected = await ComposioProvider.canExecute(capability.id, ctx.workspaceId, ctx);
    if (connected) return { status: "resolved", provider: "composio" };
  }

  return {
    status: "requires_connection",
    capability: capability.id,
    availableProviders: composioProviderSlugs(capability.id).length ? composioProviderSlugs(capability.id) : ["native"],
  };
}

export { NativeProvider, ComposioProvider };
