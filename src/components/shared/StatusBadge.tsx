import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Single source of truth for "what tone does this status mean" — replaces
// three independent, drifting statusColors maps (Quotes/Invoices/Payments
// each had their own, one of them hardcoding raw yellow-500 instead of the
// theme's warning token). Add new statuses here, not in a new local map.
const STATUS_TONE: Record<string, BadgeProps["variant"]> = {
  // positive / closed-won / paid
  paid: "success",
  accepted: "success",
  approved: "success",
  completed: "success",
  won: "success",
  active: "success",
  connected: "success",
  matched: "success",
  executed: "success",
  open: "success",
  filled: "success",
  // needs attention / in motion
  sent: "default",
  pending: "warning",
  awaiting_approval: "warning",
  in_progress: "warning",
  ambiguous: "warning",
  proposed: "warning",
  interviewing: "warning",
  // risk / negative
  overdue: "destructive",
  failed: "destructive",
  rejected: "destructive",
  cancelled: "destructive",
  lost: "destructive",
  dead_letter: "destructive",
  needs_attention: "destructive",
  // neutral / inert
  draft: "secondary",
  expired: "secondary",
  archived: "secondary",
  disconnected: "secondary",
  unmatched: "secondary",
  dismissed: "secondary",
  closed: "secondary",
};

export function statusTone(status: string): BadgeProps["variant"] {
  return STATUS_TONE[status.toLowerCase()] ?? "secondary";
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  /** Display text, if different from the raw status string (e.g. a translated label). */
  label?: string;
  className?: string;
}) {
  return (
    <Badge variant={statusTone(status)} className={cn("font-medium", className)}>
      {label ?? status}
    </Badge>
  );
}
