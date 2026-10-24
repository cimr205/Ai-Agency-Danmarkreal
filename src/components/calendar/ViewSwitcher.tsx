import { motion, useReducedMotion } from 'framer-motion';
import type { CalendarView } from './model';

const VIEWS: CalendarView[] = ['month', 'week', 'day'];

export function ViewSwitcher({ view, onChange, t }: { view: CalendarView; onChange: (v: CalendarView) => void; t: (k: string) => string }) {
  const reduce = useReducedMotion();
  return (
    <div role="tablist" className="flex rounded-full bg-[rgba(160,165,175,0.35)] p-1">
      {VIEWS.map(v => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          onClick={() => onChange(v)}
          className="relative px-6 py-2 text-[14px] font-medium text-[#1A1A1A]"
        >
          {view === v && (
            <motion.span
              layoutId="viewPill"
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 32 }}
              className="absolute inset-0 bg-white"
              style={{ borderRadius: 999 }}
            />
          )}
          <span className="relative">{t(`pages.calendar.views.${v}`)}</span>
        </button>
      ))}
    </div>
  );
}
