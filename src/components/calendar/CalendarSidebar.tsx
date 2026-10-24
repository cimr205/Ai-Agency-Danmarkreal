import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { Check } from 'lucide-react';
import type { Locale } from 'date-fns';
import { cn } from '@/lib/utils';
import { MiniCalendar } from './MiniCalendar';
import { SidebarCard } from './SidebarCard';
import { CATEGORIES, CATEGORY_DOTS, SOURCES, type CalendarSource, type EventCategory } from './model';

interface Props {
  selected: Date;
  onSelect: (d: Date) => void;
  locale: Locale;
  t: (key: string) => string;
  sources: Set<CalendarSource>;
  onToggleSource: (s: CalendarSource) => void;
  categories: Set<EventCategory>;
  onToggleCategory: (c: EventCategory) => void;
}

export function CalendarSidebar({ selected, onSelect, locale, t, sources, onToggleSource, categories, onToggleCategory }: Props) {
  const reduce = useReducedMotion();
  const item: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
  };

  return (
    <motion.aside
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
      className="flex w-[232px] shrink-0 flex-col gap-[10px] overflow-y-auto"
    >
      <motion.div variants={item}>
        <MiniCalendar
          selected={selected}
          onSelect={onSelect}
          locale={locale}
          labels={{ previous: t('pages.calendar.previousMonthShort'), next: t('pages.calendar.nextMonthShort') }}
        />
      </motion.div>

      <motion.div variants={item}>
        <SidebarCard title={t('pages.calendar.myCalendars')}>
          <ul className="flex flex-col gap-[14px]">
            {SOURCES.map(source => {
              const on = sources.has(source);
              return (
                <li key={source}>
                  <label className="flex cursor-pointer items-center gap-3 text-[13px] text-cal-sidebar-label">
                    <input type="checkbox" checked={on} onChange={() => onToggleSource(source)} className="peer sr-only" />
                    <span
                      className="grid h-[14px] w-[14px] place-items-center rounded-[3px] border-[1.5px] border-[#6B6B70] peer-focus-visible:ring-2 peer-focus-visible:ring-white/60"
                      aria-hidden="true"
                    >
                      {on && <Check className="h-[10px] w-[10px] text-cal-sidebar-text" strokeWidth={3} />}
                    </span>
                    {t(`pages.calendar.sources.${source}`)}
                  </label>
                </li>
              );
            })}
          </ul>
        </SidebarCard>
      </motion.div>

      <motion.div variants={item}>
        <SidebarCard title={t('pages.calendar.favorites')} />
      </motion.div>

      <motion.div variants={item}>
        <SidebarCard title={t('pages.calendar.categories')}>
          <ul className="flex flex-col gap-4">
            {CATEGORIES.map(category => {
              const on = categories.has(category);
              return (
                <li key={category}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onToggleCategory(category)}
                    className={cn('flex items-center gap-3 text-[13px] text-cal-sidebar-label transition-opacity', !on && 'opacity-40')}
                  >
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: CATEGORY_DOTS[category] }} aria-hidden="true" />
                    {t(`pages.calendar.categoryNames.${category}`)}
                  </button>
                </li>
              );
            })}
          </ul>
        </SidebarCard>
      </motion.div>
    </motion.aside>
  );
}
