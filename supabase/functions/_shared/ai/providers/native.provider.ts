import type { IntegrationProvider, ConnectionStatus } from "./provider.types.ts";
import type { ExecutionContext } from "../execution/execution.types.ts";
import { CapabilityRegistry } from "../capabilities/capability-registry.ts";

// Internal-DB-only capabilities need no external connection at all —
// always "connected". Execution just delegates straight to the
// capability's own execute() (which already does the real DB work).
export const NativeProvider: IntegrationProvider = {
  name: "native",

  canExecute(_capabilityId: string, _workspaceId: string, _ctx: ExecutionContext): Promise<boolean> {
    return Promise.resolve(true);
  },

  execute(capabilityId: string, ctx: ExecutionContext, input: unknown): Promise<unknown> {
    const capability = CapabilityRegistry.get(capabilityId);
    if (!capability) throw new Error(`Unknown capability: ${capabilityId}`);
    return capability.execute(ctx, input);
  },

  getConnectionStatus(): Promise<ConnectionStatus> {
    return Promise.resolve({ connected: true });
  },
};
