import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';

/** Cards B–D: dark sidebar card with a title and an optional collapsible body. */
export function SidebarCard({ title, children }: { title: string; children?: ReactNode }) {
  const [open, setOpen] = useState(true);
  const reduce = useReducedMotion();

  if (!children) {
    return (
      <div className="flex h-14 items-center justify-between rounded-[18px] bg-cal-sidebar-card px-[18px]">
        <h2 className="text-[16px] font-semibold text-cal-sidebar-text">{title}</h2>
        <ChevronRight className="h-[18px] w-[18px] text-cal-sidebar-text" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="rounded-[18px] bg-cal-sidebar-card p-[18px]">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex w-full items-center justify-between">
        <h2 className="text-[16px] font-semibold text-cal-sidebar-text">{title}</h2>
        <motion.span animate={{ rotate: open ? 0 : 180 }} transition={{ duration: reduce ? 0 : 0.25 }} className="text-cal-sidebar-text">
          <ChevronDown className="h-[18px] w-[18px]" />
        </motion.span>
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
