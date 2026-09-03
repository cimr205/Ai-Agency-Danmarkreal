import type { ExecutionContext } from "../execution/execution.types.ts";

export interface ConnectionStatus {
  connected: boolean;
  accountLabel?: string;
}

// Abstraction the whole AI engine depends on instead of talking to
// Composio (or any provider) directly — so a provider can be swapped or
// added later without touching the planner/execution engine.
export interface IntegrationProvider {
  name: string;
  canExecute(capabilityId: string, workspaceId: string, ctx: ExecutionContext): Promise<boolean>;
  execute(capabilityId: string, ctx: ExecutionContext, input: unknown): Promise<unknown>;
  getConnectionStatus(capabilityId: string, workspaceId: string, ctx: ExecutionContext): Promise<ConnectionStatus>;
}
