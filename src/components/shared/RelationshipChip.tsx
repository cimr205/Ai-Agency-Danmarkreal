import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Small pill linking to a related business object — "this email belongs to
 * this customer/deal", "this invoice came from this quote". The point of
 * the operating-system framing is that these relationships should be
 * visible everywhere without opening another page; this is the one
 * reusable primitive for that, instead of every page inventing its own
 * "Badge variant=secondary" ad hoc link.
 */
export function RelationshipChip({
  icon: Icon,
  label,
  value,
  href,
  muted = false,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  label?: string;
  value: React.ReactNode;
  href?: string;
  /** Use for an unresolved/ambiguous relationship — same shape, quieter styling, no link. */
  muted?: boolean;
  className?: string;
}) {
  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        muted
          ? "border-dashed border-border text-muted-foreground"
          : "border-transparent bg-secondary text-secondary-foreground",
        href && !muted && "transition-colors hover:bg-secondary/70",
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {label && <span className="text-muted-foreground">{label}:</span>}
      <span className="truncate">{value}</span>
    </span>
  );

  if (!href || muted) return content;
  return <Link to={href}>{content}</Link>;
}
