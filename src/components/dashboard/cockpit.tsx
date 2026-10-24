import type { ComponentType, ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, RadioTower } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { isLocale, useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { itemsInTier, type PriorityItem, type Tier } from '@/lib/priorities/types';
import { useTr } from '@/lib/priorities/useTr';

/* Shared building blocks of the "cockpit" dashboards (light glass, dark signal
   panel, gradient pulse cards). Every section dashboard is composed from these
   so the five of them read as one product. */

export type Tone = 'blue' | 'violet' | 'cyan' | 'risk';
type IconType = ComponentType<{ className?: string }>;

export function useAppBase(): string {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  return `/${locale}/app`;
}

export function useTodayLabel(): string {
  const { locale } = useI18n();
  const tag = locale === 'da' ? 'da-DK' : locale === 'de' ? 'de-DE' : 'en-GB';
  return new Date().toLocaleDateString(tag, { weekday: 'long', day: 'numeric', month: 'short' }).replace(/\.$/, '');
}

const TONE_GRADIENT: Record<Tone, string> = {
  blue: 'from-blue-600 to-cyan-400 text-blue-600',
  violet: 'from-violet-600 to-fuchsia-400 text-violet-600',
  cyan: 'from-cyan-500 to-blue-500 text-cyan-600',
  risk: 'from-rose-500 to-orange-400 text-rose-600',
};

export function CockpitPage({ children }: { children: ReactNode }) {
  return (
    <div className="relative -m-4 min-h-[calc(100vh-76px)] overflow-hidden bg-[#eef4ff] p-4 text-slate-950 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(82,113,255,0.34),transparent_28%),radial-gradient(circle_at_84%_12%,rgba(236,124,255,0.24),transparent_26%),radial-gradient(circle_at_52%_78%,rgba(50,214,255,0.20),transparent_36%),linear-gradient(135deg,#f8fbff_0%,#edf4ff_48%,#f9f2ff_100%)]" />
      <div className="pointer-events-none absolute left-6 top-8 h-[520px] w-[520px] rounded-full bg-blue-400/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[420px] w-[520px] rounded-full bg-fuchsia-300/25 blur-3xl" />
      <div className="relative mx-auto max-w-[1500px] space-y-6">{children}</div>
    </div>
  );
}

export interface HeroAction { icon: IconType; label: string; href: string }

export interface HeroProps {
  crumb: string;
  eyebrow: string;
  lead: string;
  accent: string;
  intro: string;
  primary: { label: string; href: string };
  actions: HeroAction[];
  signal: {
    eyebrow: string;
    title: string;
    items: { label: string; value: number; loading: boolean }[];
    note: string;
    urgent: boolean;
    statusLabel: string;
  };
}

export function CockpitHero({ crumb, eyebrow, lead, accent, intro, primary, actions, signal }: HeroProps) {
  const today = useTodayLabel();
  const tr = useTr();
  return (
    <section className="overflow-hidden rounded-[2.25rem] border border-white/70 bg-white/58 shadow-[0_30px_100px_rgba(42,62,130,0.22)] backdrop-blur-2xl">
      <div className="grid min-h-[430px] lg:grid-cols-[minmax(0,1.45fr)_440px]">
        <div className="relative p-6 sm:p-8 lg:p-10">
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span className="rounded-full border border-white/70 bg-white/60 px-3 py-1.5 shadow-sm">{tr('sec.home')}</span>
            <span>/</span>
            <span>{crumb}</span>
            <span>/</span>
            <span className="rounded-full border border-white/70 bg-white/60 px-3 py-1.5 shadow-sm">{today}</span>
          </div>
          <div className="mt-10 max-w-3xl">
            <p className="text-[12px] font-bold uppercase tracking-[0.24em] text-blue-600">{eyebrow}</p>
            <h1 className="mt-4 text-[42px] font-semibold leading-[0.95] tracking-[-0.055em] text-slate-950 sm:text-[58px] lg:text-[72px]">
              {lead}
              <span className="block bg-gradient-to-r from-blue-600 via-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">{accent}</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-slate-600 sm:text-base">{intro}</p>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to={primary.href} className="group inline-flex h-12 items-center gap-3 rounded-full bg-slate-950 px-5 text-[13px] font-semibold text-white shadow-[0_18px_38px_rgba(15,23,42,0.25)] transition-transform hover:-translate-y-0.5">
              {primary.label}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            {actions.map(a => (
              <Link key={a.label} to={a.href} className="inline-flex h-12 items-center gap-2 rounded-full border border-white/70 bg-white/62 px-4 text-[13px] font-semibold text-slate-700 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:bg-white/85 hover:text-slate-950">
                <a.icon className="h-4 w-4 text-blue-600" />
                {a.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="relative border-t border-white/60 bg-slate-950/90 p-6 text-white lg:border-l lg:border-t-0 lg:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_8%,rgba(92,124,255,0.48),transparent_32%),radial-gradient(circle_at_92%_28%,rgba(244,114,255,0.30),transparent_34%)]" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/45">{signal.eyebrow}</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{signal.title}</h2>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-xl">
                <RadioTower className="h-5 w-5 text-cyan-200" />
              </span>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3">
              {signal.items.map(i => <SignalPill key={i.label} {...i} />)}
            </div>
            <div className="mt-7 rounded-[1.75rem] border border-white/12 bg-white/8 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-xl">
              <p className="text-sm leading-6 text-white/72">{signal.note}</p>
              <div className="mt-5 flex items-center gap-2">
                <span className={cn('h-2.5 w-2.5 rounded-full', signal.urgent ? 'bg-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.9)]' : 'bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]')} />
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">{signal.statusLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SignalPill({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/42">{label}</div>
      {loading ? <div className="mt-4 h-7 w-14 rounded-full bg-white/10" /> : <div className="mt-4 text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{value}</div>}
    </div>
  );
}

export function PulseMetric({ label, value, detail, href, icon: Icon, tone }: { label: string; value: string | null; detail: string; href: string; icon: IconType; tone: Tone }) {
  return (
    <Link to={href} className="group relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/68 p-5 shadow-[0_18px_55px_rgba(45,77,150,0.12)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:bg-white/86">
      <div className={cn('absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br opacity-20 blur-2xl', TONE_GRADIENT[tone])} />
      <div className="relative flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>
        <span className={cn('grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg', TONE_GRADIENT[tone])}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="relative mt-5">
        {value === null ? <Skeleton className="h-8 w-24 rounded-full" /> : <div className="text-[28px] font-semibold leading-none tracking-[-0.04em] text-slate-950 tabular-nums">{value}</div>}
        <div className="mt-2 text-[12px] text-slate-500">{detail}</div>
      </div>
    </Link>
  );
}

export function PulseRow({ children }: { children: ReactNode }) {
  return <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{children}</section>;
}

export function PanelHeader({ eyebrow, title, action, href, dark = false }: { eyebrow: string; title: string; action?: string; href?: string; dark?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <div>
        <div className={cn('text-[10px] font-bold uppercase tracking-[0.19em]', dark ? 'text-white/45' : 'text-blue-600')}>{eyebrow}</div>
        <h2 className={cn('mt-1 text-[22px] font-semibold tracking-[-0.04em]', dark ? 'text-white' : 'text-slate-950')}>{title}</h2>
      </div>
      {action && href && (
        <Link to={href} className={cn('flex h-10 items-center gap-2 rounded-full px-4 text-[12px] font-semibold transition-transform hover:-translate-y-0.5', dark ? 'bg-white/10 text-white' : 'bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)]')}>
          {action} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

export function Panel({ children, dark = false, className }: { children: ReactNode; dark?: boolean; className?: string }) {
  return (
    <div className={cn('rounded-[2rem] border border-white/70 p-5 backdrop-blur-2xl', dark ? 'bg-slate-950 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]' : 'bg-white/62 shadow-[0_24px_80px_rgba(45,77,150,0.11)]', className)}>
      {children}
    </div>
  );
}

export function MicroStack({ items }: { items: { label: string; value: string; tone?: 'risk' }[] }) {
  return (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.label} className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3">
          <span className="text-[12px] text-slate-500">{item.label}</span>
          <span className={cn('text-[14px] font-semibold text-slate-950 tabular-nums', item.tone === 'risk' && 'text-rose-600')}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function CompactNumber({ icon: Icon, label, value, loading, tone }: { icon: IconType; label: string; value: number | string; loading: boolean; tone?: 'risk' }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/8 p-4">
      <Icon className={cn('h-4 w-4', tone === 'risk' ? 'text-rose-300' : 'text-cyan-200')} />
      {loading ? <div className="mt-5 h-8 w-16 rounded-full bg-white/10" /> : <div className={cn('mt-5 text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums', tone === 'risk' && 'text-rose-300')}>{value}</div>}
      <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/42">{label}</div>
    </div>
  );
}

export function EmptyLane({ title, text, href, action, dark = false }: { title: string; text: string; href: string; action: string; dark?: boolean }) {
  return (
    <div className={cn('flex min-h-[180px] flex-col justify-center rounded-[1.35rem] border border-dashed p-6', dark ? 'border-white/18 bg-white/5' : 'border-slate-300/70 bg-white/60')}>
      <p className={cn('text-[15px] font-semibold', dark ? 'text-white' : 'text-slate-950')}>{title}</p>
      <p className={cn('mt-2 max-w-md text-[13px] leading-6', dark ? 'text-white/62' : 'text-slate-500')}>{text}</p>
      <Link to={href} className={cn('mt-4 flex w-fit items-center gap-1 rounded-full px-4 py-2 text-[12px] font-semibold', dark ? 'bg-white/10 text-white' : 'bg-slate-950 text-white')}>
        {action} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export interface ListRow { id: string; primary: string; secondary?: string; tone?: 'risk' | 'ok' | 'muted'; href?: string }

export function ListPanel({ icon: Icon, eyebrow, title, emptyText, href, items, isLoading, linkLabel }: { icon: IconType; eyebrow: string; title: string; emptyText: string; href: string; items: ListRow[]; isLoading: boolean; linkLabel: string }) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.16)]"><Icon className="h-4 w-4" /></span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</p>
            <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.035em] text-slate-950">{title}</h2>
          </div>
        </div>
        <Link to={href} className="rounded-full border border-white/70 bg-white/70 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 hover:text-blue-600">{linkLabel}</Link>
      </div>
      <div className="mt-5 rounded-[1.6rem] border border-white/70 bg-white/70 p-4">
        {isLoading ? (
          <div className="space-y-2.5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-2xl" />)}</div>
        ) : items.length === 0 ? (
          <p className="text-[13px] leading-6 text-slate-500">{emptyText}</p>
        ) : (
          <ul className="space-y-2">
            {items.slice(0, 6).map(item => {
              const dot = item.tone === 'risk' ? 'bg-rose-500 text-rose-500' : item.tone === 'ok' ? 'bg-emerald-500 text-emerald-500' : item.tone === 'muted' ? 'bg-slate-300 text-slate-300' : 'bg-blue-500 text-blue-500';
              const row = (
                <>
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_14px_currentColor]', dot)} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800">{item.primary}</span>
                  {item.secondary && <span className="text-[11px] text-slate-400 tabular-nums">{item.secondary}</span>}
                </>
              );
              return (
                <li key={item.id}>
                  {item.href ? <Link to={item.href} className="flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-3 transition-colors hover:bg-white">{row}</Link> : <div className="flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-3">{row}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}

export interface BarRow { label: string; value: number; display: string; color: string; note?: string; noteTone?: 'risk' }

export function BarRows({ rows }: { rows: BarRow[] }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="space-y-4">
      {rows.map(r => (
        <div key={r.label}>
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="truncate text-slate-500">{r.label}</span>
            <span className="font-semibold text-slate-900 tabular-nums">{r.display}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200/70">
            <div className="h-full rounded-full" style={{ width: `${r.value === 0 ? 0 : Math.max(6, (r.value / max) * 100)}%`, background: r.color }} />
          </div>
          {r.note && <div className={cn('mt-1 text-[11px]', r.noteTone === 'risk' ? 'font-medium text-rose-600' : 'text-slate-400')}>{r.note}</div>}
        </div>
      ))}
    </div>
  );
}

const TIER_STYLE: Record<Tier, { chip: string; ring: string; dot: string }> = {
  1: { chip: 'bg-gradient-to-br from-rose-500 to-orange-400 text-white', ring: 'border-rose-200/80', dot: 'text-rose-600' },
  2: { chip: 'bg-gradient-to-br from-blue-600 to-indigo-500 text-white', ring: 'border-blue-200/70', dot: 'text-blue-600' },
  3: { chip: 'bg-gradient-to-br from-slate-500 to-slate-400 text-white', ring: 'border-slate-200/80', dot: 'text-slate-500' },
};

const TIER_KEYS: Record<Tier, { label: string; empty: string }> = {
  1: { label: 'sec.tier1', empty: 'sec.tierEmpty1' },
  2: { label: 'sec.tier2', empty: 'sec.tierEmpty2' },
  3: { label: 'sec.tier3', empty: 'sec.tierEmpty3' },
};

/** The one memorable element of every section dashboard: what to do first, today, and soon. */
export function PriorityBoard({ items, loading }: { items: PriorityItem[]; loading: boolean }) {
  const tr = useTr();
  const tiers: Tier[] = [1, 2, 3];
  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/64 p-4 shadow-[0_24px_80px_rgba(45,77,150,0.13)] backdrop-blur-2xl sm:p-5">
      <PanelHeader eyebrow={tr('sec.priorities')} title={tr('sec.prioritiesTitle')} />
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {tiers.map(tier => {
          const list = itemsInTier(items, tier);
          const style = TIER_STYLE[tier];
          return (
            <div key={tier} className={cn('rounded-[1.6rem] border bg-white/70 p-4', style.ring)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={cn('grid h-8 min-w-8 place-items-center rounded-xl px-2 text-[12px] font-bold shadow-sm', style.chip)}>P{tier}</span>
                  <span className="text-[14px] font-semibold tracking-[-0.02em] text-slate-950">{tr(TIER_KEYS[tier].label)}</span>
                </div>
                <span className="text-[12px] font-semibold text-slate-400 tabular-nums">{loading ? '–' : list.length}</span>
              </div>
              <div className="mt-4 space-y-2.5">
                {loading ? (
                  Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-[76px] w-full rounded-2xl" />)
                ) : list.length === 0 ? (
                  <div className="flex items-start gap-3 rounded-2xl bg-slate-50/80 p-4">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <p className="text-[13px] leading-5 text-slate-500">{tr(TIER_KEYS[tier].empty)}</p>
                  </div>
                ) : (
                  <>
                    {list.slice(0, 4).map(item => (
                      <Link key={item.id} to={item.href} className="group block rounded-2xl border border-slate-200/70 bg-white px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(45,77,150,0.12)]">
                        <p className="line-clamp-2 text-[13px] font-semibold leading-5 text-slate-900">{item.title}</p>
                        {item.detail && <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-500">{item.detail}</p>}
                        <p className={cn('mt-2 flex items-center gap-1 text-[12px] font-semibold', style.dot)}>{item.cta} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></p>
                      </Link>
                    ))}
                    {list.length > 4 && <p className="px-1 text-[12px] font-medium text-slate-400">{tr('sec.more', { n: list.length - 4 })}</p>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
