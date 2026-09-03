// deno-lint-ignore-file no-explicit-any
import { z } from "npm:zod@3.23.8";
import type { Domain } from "../router/request-router.ts";
import type { ExecutionContext, CapabilityResult, Role } from "../execution/execution.types.ts";

export type RiskLevel = "read" | "write" | "external_write" | "financial" | "destructive";

export interface Capability {
  id: string;
  domain: Domain;
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  risk: RiskLevel;
  requiresConfirmation: boolean;
  requiredPermissions: Role[];
  supportedProviders: string[]; // "native" | "composio" | specific provider slugs
  execute: (context: ExecutionContext, input: unknown) => Promise<CapabilityResult>;
}
