import { cn } from '@/lib/utils';

/**
 * A frosted glass stat card — translucent, blurred, softly bordered, sitting
 * in the WorkspaceFrame's tray rather than a flat solid-colour block. Active
 * tile: stronger glass, emerald number, small terracotta dot. Inactive:
 * fainter glass, ink-muted number.
 */
export function WorkspaceTile({
  label,
  value,
  active = false,
}: {
  label: string;
  value: string | number;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-1 rounded-[18px] border px-3 py-3 text-center tabular-nums backdrop-blur-md',
        active ? 'bg-workspace-tile-active' : 'bg-workspace-tile-inactive',
      )}
      style={{ borderColor: 'var(--workspace-glass-border)' }}
    >
      {active && <span className="mb-0.5 h-1.5 w-1.5 rounded-full bg-workspace-accent-2" aria-hidden="true" />}
      <span className={cn('text-[26px] font-bold leading-none tracking-[-0.02em]', active ? 'text-workspace-accent' : 'text-workspace-ink/60')}>
        {value}
      </span>
      <span className={cn('text-[12px] font-medium', active ? 'text-workspace-ink/70' : 'text-workspace-ink/45')}>{label}</span>
    </div>
  );
}
