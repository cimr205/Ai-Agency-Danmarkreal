import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * A list row that becomes an elongated pill when active — the same
 * highlight shape as the calendar's active week in the mini calendar
 * (src/components/calendar/MiniCalendar.tsx `miniWeek` layout id),
 * generalised to any sidebar list (Power Dialer's lead queue, …).
 */
export function WorkspaceActiveRow({
  active,
  layoutId,
  onClick,
  disabled,
  children,
  className,
}: {
  active: boolean;
  layoutId: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'relative w-full rounded-full px-4 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        !active && 'hover:bg-workspace-panel-row',
        className,
      )}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          className="absolute inset-0 rounded-full bg-workspace-panel-row"
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}
