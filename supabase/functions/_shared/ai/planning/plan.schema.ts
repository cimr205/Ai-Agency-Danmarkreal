import { z } from "npm:zod@3.23.8";

export const PlanStepSchema = z.object({
  id: z.string().min(1),
  capability: z.string().min(1),
  input: z.record(z.unknown()),
  dependsOn: z.array(z.string()).default([]),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanSchema = z.object({
  language: z.enum(["da", "en", "de"]),
  intent: z.string().min(1),
  requiresClarification: z.boolean(),
  clarificationQuestion: z.string().nullable(),
  steps: z.array(PlanStepSchema).max(10),
});
export type Plan = z.infer<typeof PlanSchema>;
