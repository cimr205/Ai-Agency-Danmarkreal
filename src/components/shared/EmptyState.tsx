import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  variant?: "default" | "outline";
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  /** Render bare (no Card wrapper) for use inside a table cell / existing card. */
  bare?: boolean;
}

export function EmptyState({ icon: Icon, title, hint, action, secondaryAction, bare }: EmptyStateProps) {
  const content = (
    <div className="py-12 text-center space-y-3">
      <Icon className="h-10 w-10 mx-auto text-muted-foreground/40" />
      <p className="text-muted-foreground">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {(action || secondaryAction) && (
        <div className="flex gap-2 justify-center pt-1">
          {secondaryAction && (
            <Button variant={secondaryAction.variant ?? "outline"} size="sm" onClick={secondaryAction.onClick} className="gap-1.5">
              {secondaryAction.icon && <secondaryAction.icon className="h-3.5 w-3.5" />}
              {secondaryAction.label}
            </Button>
          )}
          {action && (
            <Button variant={action.variant ?? "default"} size="sm" onClick={action.onClick} className="gap-1.5">
              {action.icon && <action.icon className="h-3.5 w-3.5" />}
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (bare) return content;
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-0">{content}</CardContent>
    </Card>
  );
}
