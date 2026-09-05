import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border border-[rgba(255,255,255,0.10)] bg-[var(--bg-overlay)] px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-[var(--accent-subtle)] disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
