import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Clock, ExternalLink, User, X } from 'lucide-react';
import type { CompanyMember } from '@/hooks/api/useCalendar';
import { AvatarStack } from './EventCard';
import { EVENT_KINDS, type CalendarItem, type EventKind } from './model';

interface Props {
  item: CalendarItem;
  anchor: DOMRect;
  members: CompanyMember[];
  memberMap: Map<string, CompanyMember>;
  dateLabel: string;
  timeLabel: string;
  t: (key: string) => string;
  onClose: () => void;
  onTitleCommit: (title: string) => void;
  onKindChange: (kind: EventKind) => void;
  onAttendeesChange: (ids: string[]) => void;
}

const WIDTH = 188;
const MARGIN = 8;

export function EventPopover({ item, anchor, members, memberMap, dateLabel, timeLabel, t, onClose, onTitleCommit, onKindChange, onAttendeesChange }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(item.title);
  const [picking, setPicking] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; origin: string } | null>(null);
  const editable = item.editable;

  useEffect(() => setTitle(item.title), [item.id, item.title]);

  // Closing by Esc, X or an outside click must not drop an unsaved title
  // (blur does not fire when the popover unmounts).
  const latest = useRef({ title, item, editable, onTitleCommit, onClose });
  latest.current = { title, item, editable, onTitleCommit, onClose };
  const commitAndClose = useCallback(() => {
    const l = latest.current;
    if (l.editable && l.title.trim() !== l.item.title) l.onTitleCommit(l.title.trim());
    l.onClose();
  }, []);

  // Right of the event when it fits, otherwise left; clamped to the viewport.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 240;
    const fitsRight = anchor.right + MARGIN + WIDTH <= window.innerWidth - MARGIN;
    const left = fitsRight ? anchor.right + MARGIN : Math.max(MARGIN, anchor.left - MARGIN - WIDTH);
    const top = Math.min(Math.max(MARGIN, anchor.top), window.innerHeight - h - MARGIN);
    setPos({ left, top, origin: `${fitsRight ? 'left' : 'right'} ${Math.max(0, anchor.top - top) + 16}px` });
  }, [anchor, picking]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') commitAndClose(); };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || ref.current?.contains(target)) return;
      // Clicking another event re-targets the popover instead of closing it.
      if (target.closest('[data-event-id]')) return;
      commitAndClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [commitAndClose]);

  const available = members.filter(m => !item.attendeeIds.includes(m.user_id));

  return createPortal(
    <motion.div
      ref={ref}
      role="dialog"
      aria-label={item.title || t('pages.calendar.noTitle')}
      initial={{ opacity: 0, scale: reduce ? 1 : 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 420, damping: 30 }}
      className="fixed z-[60] rounded-[20px] bg-white p-4 font-cal shadow-[0_20px_50px_rgba(20,20,40,0.18)]"
      style={{ width: WIDTH, left: pos?.left ?? -9999, top: pos?.top ?? -9999, transformOrigin: pos?.origin }}
    >
      <button type="button" onClick={commitAndClose} aria-label={t('pages.calendar.close')} className="absolute right-3 top-3 text-[#9A9AA0] hover:text-[#555]">
        <X className="h-4 w-4" />
      </button>

      <input
        value={title}
        readOnly={!editable}
        autoFocus={editable && !item.title}
        aria-label={t('pages.calendar.titleField')}
        placeholder={t('pages.calendar.noTitle')}
        onChange={e => setTitle(e.target.value)}
        onBlur={() => { if (editable && title.trim() !== item.title) onTitleCommit(title.trim()); }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="mt-3 w-full bg-transparent text-[16px] font-semibold text-[#111] caret-[#111] outline-none placeholder:text-[#C4C4C8]"
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        {EVENT_KINDS.map(kind => {
          const active = item.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              disabled={!editable}
              onClick={() => onKindChange(kind)}
              className="relative px-2.5 py-1.5 text-left text-[11.5px] font-medium disabled:cursor-default"
              style={{ color: active ? '#C752C9' : '#555' }}
            >
              {active && (
                <motion.span
                  layoutId="popTab"
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 bg-[#F6D3F4]"
                  style={{ borderRadius: 999 }}
                />
              )}
              <span className="relative">{t(`pages.calendar.kinds.${kind}`)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-start gap-2 text-[11.5px] tabular-nums text-[#1A1A1A]">
        <Clock className="mt-px h-3.5 w-3.5 shrink-0" />
        <span className="flex flex-wrap gap-x-[18px] gap-y-0.5">
          <span className="whitespace-nowrap">{dateLabel}</span>
          {timeLabel && <span className="whitespace-nowrap">{timeLabel}</span>}
        </span>
      </div>

      {item.source === 'external' && item.url && (
        <a href={item.url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 text-[11px] text-[#9A9AA0] hover:text-[#555]">
          <ExternalLink className="h-3.5 w-3.5" />{t('pages.calendar.openExternal')}
        </a>
      )}

      {item.source === 'events' && (
        <>
          <button
            type="button"
            disabled={!editable || available.length === 0}
            onClick={() => setPicking(p => !p)}
            className="mt-3 flex items-center gap-2 text-[11px] text-[#9A9AA0] enabled:hover:text-[#555]"
          >
            <User className="h-3.5 w-3.5" />{t('pages.calendar.addTeammates')}
          </button>

          {picking && (
            <ul className="mt-2 max-h-28 overflow-y-auto rounded-[12px] border border-[#ECECEF] p-1">
              {available.map(m => (
                <li key={m.user_id}>
                  <button
                    type="button"
                    onClick={() => { onAttendeesChange([...item.attendeeIds, m.user_id]); setPicking(false); }}
                    className="flex w-full items-center gap-2 rounded-[8px] px-1.5 py-1 text-left text-[11px] text-[#1A1A1A] hover:bg-[#F4F4F6]"
                  >
                    <AvatarStack ids={[m.user_id]} members={memberMap} size={18} />
                    <span className="truncate">{m.full_name || m.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {item.attendeeIds.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {item.attendeeIds.map(id => {
                const m = memberMap.get(id);
                const name = m?.full_name || m?.email || id.slice(0, 8);
                return (
                  <li key={id} className="flex items-center gap-2 text-[11px] text-[#1A1A1A]">
                    <AvatarStack ids={[id]} members={memberMap} size={18} />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => onAttendeesChange(item.attendeeIds.filter(x => x !== id))}
                        aria-label={t('pages.calendar.removeTeammate').replace('{name}', name)}
                        className="text-[#9A9AA0] hover:text-[#555]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </motion.div>,
    document.body,
  );
}
