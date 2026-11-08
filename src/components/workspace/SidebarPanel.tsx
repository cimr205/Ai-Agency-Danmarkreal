import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * A dark, rounded, collapsible panel for a workspace's left column — the
 * same shape as the calendar's "My Calendars" / "Categories" cards
 * (src/components/calendar/SidebarCard.tsx), generalised so other modules
 * (Power Dialer's lead queue, outcome filters, …) can use it without
 * depending on the calendar module.
 */
export function WorkspaceSidebarPanel({
  title,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  badge?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();

  if (!children) {
    return (
      <div
        className="flex h-14 items-center justify-between rounded-[18px] px-[18px]"
        style={{ background: 'var(--workspace-panel)' }}
      >
        <h2 className="text-[16px] font-semibold text-workspace-ink-on-dark">{title}</h2>
        <ChevronRight className="h-[18px] w-[18px] text-workspace-ink-on-dark" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="rounded-[18px] p-[18px]" style={{ background: 'var(--workspace-panel)' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between">
        <h2 className="text-[16px] font-semibold text-workspace-ink-on-dark">{title}</h2>
        <div className="flex items-center gap-2">
          {badge}
          <motion.span animate={{ rotate: open ? 0 : 180 }} transition={{ duration: reduce ? 0 : 0.25 }} className="text-workspace-ink-on-dark">
            <ChevronDown className="h-[18px] w-[18px]" />
          </motion.span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
