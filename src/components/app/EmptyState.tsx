import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 animate-fade-in">
      {/* Decorative illustration background */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-primary/5 scale-[2.5] blur-2xl" />
        <div className="relative h-20 w-20 rounded-2xl bg-muted/50 border border-border/50 flex items-center justify-center">
          <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary/30 animate-pulse" />
          <div className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-accent/20" />
          <Icon className="h-8 w-8 text-muted-foreground/50" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground opacity-60 text-center max-w-xs mb-6">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="gap-2">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
