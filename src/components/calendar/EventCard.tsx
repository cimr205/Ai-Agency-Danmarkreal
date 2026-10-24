import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'framer-motion';
import { EVENT_COLORS, type CalendarItem } from './model';
import type { CompanyMember } from '@/hooks/api/useCalendar';

export function AvatarStack({ ids, members, size = 26 }: { ids: string[]; members: Map<string, CompanyMember>; size?: number }) {
  if (!ids.length) return null;
  return (
    <div className="flex">
      {ids.slice(0, 4).map((id, i) => {
        const m = members.get(id);
        const initials = (m?.full_name || m?.email || '?').split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
        return (
          <span
            key={id}
            title={m?.full_name || m?.email || undefined}
            className="grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-white bg-[#C9BDF5] text-[9px] font-semibold text-[#3A2E7A]"
            style={{ width: size, height: size, marginLeft: i ? -8 : 0, background: m?.avatar_url ? undefined : ['#C9BDF5', '#D4E4EE', '#D3E6E4', '#E4E1F6'][i % 4] }}
          >
            {m?.avatar_url ? <img src={m.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}
          </span>
        );
      })}
    </div>
  );
}

interface Props {
  item: CalendarItem;
  timeLabel: string;
  members: Map<string, CompanyMember>;
  style: React.CSSProperties;
  index: number;
  onOpen: (item: CalendarItem, el: HTMLElement) => void;
}

/** A timed event block in the week/day grid. */
export const EventCard = forwardRef<HTMLButtonElement, Props>(function EventCard({ item, timeLabel, members, style, index, onOpen }, ref) {
  const reduce = useReducedMotion();
  const c = EVENT_COLORS[item.color];
  const h = typeof style.height === 'number' ? style.height : 0;
  const tall = h >= 92;
  // Room for a wrapped title plus the time line.
  const twoLines = h >= 66;
  return (
    <motion.button
      ref={ref}
      type="button"
      data-event-id={item.id}
      initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, delay: reduce ? 0 : Math.min(index, 12) * 0.02, ease: 'easeOut' }}
      whileHover={reduce ? undefined : { y: -2, boxShadow: '0 8px 20px rgba(0,0,0,0.08)' }}
      onClick={e => { e.stopPropagation(); onOpen(item, e.currentTarget); }}
      className="absolute flex cursor-pointer flex-col overflow-hidden rounded-[14px] px-3 py-[10px] text-left"
      style={{ ...style, background: c.bg }}
    >
      <span className={cn('text-[12.5px] font-medium leading-[16px]', twoLines ? 'line-clamp-2' : 'truncate')} style={{ color: c.title }}>{item.title}</span>
      <span className="mt-1 truncate text-[11.5px] leading-[14px] tabular-nums" style={{ color: c.time }}>{timeLabel}</span>
      {tall && item.attendeeIds.length > 0 && (
        <span className="mt-auto pt-2"><AvatarStack ids={item.attendeeIds} members={members} /></span>
      )}
    </motion.button>
  );
});
