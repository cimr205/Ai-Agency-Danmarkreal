// The Growth OS registry is defined once, next to the edge-function runtime,
// and shared with the UI from here (pure data, no Deno APIs).
export * from '../../supabase/functions/_shared/growth-os/registry/index.ts';
export type * from '../../supabase/functions/_shared/growth-os/types.ts';
export { ACTION_LEVELS, actionLevel, requiredApprover } from '../../supabase/functions/_shared/growth-os/approval.ts';
