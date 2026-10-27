import { cn } from '@/lib/utils';

/**
 * The rounded tile with a big number — the calendar's day-of-week tiles
 * (src/components/calendar/DayHeaderStrip.tsx) generalised to any
 * label+value pair, so Power Dialer's stat row can use the same shape.
 * Active tile: white background, accent-coloured number (large/bold only —
 * see docs/design/palette.md contrast notes). Inactive: dimmed, sits on the
 * gradient.
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
        'flex flex-1 flex-col items-center justify-center gap-1 rounded-[16px] px-3 py-3 text-center tabular-nums',
        active ? 'bg-workspace-tile-active' : 'bg-workspace-tile-inactive',
      )}
    >
      <span className={cn('text-[28px] font-bold leading-none tracking-[-0.02em]', active ? 'text-workspace-accent' : 'text-workspace-ink')}>
        {value}
      </span>
      <span className={cn('text-[12px] font-medium', active ? 'text-workspace-accent/80' : 'text-workspace-ink/70')}>{label}</span>
    </div>
  );
}
