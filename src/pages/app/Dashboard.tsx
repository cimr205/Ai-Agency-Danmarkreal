import type { ComponentType } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Briefcase, Calendar, CheckCircle2, Clock3, FileText, Mail, PhoneCall, RadioTower, ShieldCheck, Target, Users, Wallet } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { isLocale } from "@/lib/i18n";
import { isOnboardingComplete } from "@/lib/onboarding";
import { useDashboard, type FocusItem } from "@/hooks/api/useDashboard";
import { useCurrency } from "@/contexts/CurrencyContext";
import { cn } from "@/lib/utils";

const FOCUS_ICON = { invoice: FileText, deal: Briefcase, lead: PhoneCall } as const;
const FOCUS_CTA = { invoice: "Send rykker", deal: "Følg op", lead: "Ring nu" } as const;
const AURORA_COLORS = ["#5b7cfa", "#9b7cff", "#20d6ff", "#f59fe8"];

type Tone = "blue" | "violet" | "cyan" | "risk";

function focusItemText(item: FocusItem): string {
  if (item.kind === "invoice") {
    return "Faktura #" + item.label + " er " + item.days + " dag" + (item.days === 1 ? "" : "e") + " forfalden" + (item.company ? " hos " + item.company : "");
  }
  if (item.kind === "deal") {
    return "Deal “" + item.label + "” har stået i " + item.stage + " i " + item.days + " dag" + (item.days === 1 ? "" : "e");
  }
  const who = item.company ? item.label + " hos " + item.company : item.label;
  return item.overdue ? who + ": opfølgning er overskredet" : who + ": " + item.days + " dage uden kontakt";
}

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const { data: d, isLoading } = useDashboard();
  const navigate = useNavigate();
  const params = useParams();
  const routeLocale = isLocale(params.locale) ? params.locale : "en";
  const base = "/" + routeLocale + "/app";
  const { format } = useCurrency();
  const showOnboardingBanner = isAdmin && !isOnboardingComplete();

  const firstName = (profile?.full_name || "").split(" ")[0] || "der";
  const today = new Date().toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "short" }).replace(/\.$/, "");
  const monthValue = d?.invoices?.monthValue ?? 0;
  const lastMonthValue = d?.invoices?.lastMonthValue ?? 0;
  const momDelta = lastMonthValue > 0 ? Math.round(((monthValue - lastMonthValue) / lastMonthValue) * 100) : null;
  const openDeals = (d?.deals?.total ?? 0) - (d?.deals?.won ?? 0) - (d?.deals?.lost ?? 0);
  const overdueValue = d?.invoices?.overdueValue ?? 0;
  const activeWork = (d?.tasks?.pending ?? 0) + (d?.tasks?.inProgress ?? 0);
  const focusItems = d?.focusItems ?? [];
  const pipelineStages = (d?.pipeline?.stages ?? []).filter((stage) => stage.count > 0);
  const meetings = d?.today?.meetings ?? [];
  const tasks = d?.today?.tasks ?? [];

  const pulse = [
    { label: "Cash collected", value: isLoading ? null : format(monthValue), detail: typeof momDelta === "number" ? (momDelta >= 0 ? "+" : "-") + Math.abs(momDelta) + "% vs. sidste måned" : "første aktive måned", href: base + "/finance/invoices", tone: momDelta !== null && momDelta < 0 ? "risk" : "blue", icon: Wallet },
    { label: "Pipeline", value: isLoading ? null : format(d?.deals?.openValue ?? 0), detail: openDeals + " åbne muligheder", href: base + "/crm/deals?view=board", tone: "violet", icon: Briefcase },
    { label: "Pressure", value: isLoading ? null : format(overdueValue), detail: (d?.invoices?.overdue ?? 0) + " forfaldne fakturaer", href: base + "/finance/invoices", tone: overdueValue > 0 ? "risk" : "cyan", icon: AlertTriangle },
    { label: "Workload", value: isLoading ? null : String(activeWork), detail: tasks.length + " opgaver i dag", href: base + "/work/tasks", tone: activeWork > 8 ? "risk" : "blue", icon: CheckCircle2 },
  ] as const;

  const quickActions = [
    { icon: Target, label: "Lead", href: base + "/crm/leads?create=true" },
    { icon: Briefcase, label: "Deal", href: base + "/crm/deals?create=true" },
    { icon: FileText, label: "Faktura", href: base + "/finance/invoices?create=true" },
    { icon: Calendar, label: "Møde", href: base + "/work/calendar?create=true" },
    { icon: Mail, label: "Mail", href: base + "/email/emails?compose=true" },
  ];

  const spotlightItems = [
    ...focusItems.slice(0, 2).map((item) => ({
      id: item.kind + "-" + item.id,
      label: item.kind === "invoice" ? "Cash signal" : item.kind === "deal" ? "Pipeline signal" : "Lead signal",
      title: focusItemText(item),
      meta: FOCUS_CTA[item.kind],
      icon: FOCUS_ICON[item.kind],
      tone: item.overdue || item.kind === "invoice" ? "risk" : "blue",
      href: item.kind === "invoice" ? base + "/finance/invoices" : item.kind === "deal" ? base + "/crm/deals?view=board" : base + "/crm/leads",
    })),
    ...tasks.slice(0, 2).map((task) => ({ id: "task-" + task.id, label: "Execution", title: task.title, meta: task.due_date ? new Date(task.due_date).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : "uden frist", icon: CheckCircle2, tone: task.priority === "high" ? "risk" : "violet", href: base + "/work/tasks" })),
    ...meetings.slice(0, 1).map((meeting) => ({ id: "meeting-" + meeting.id, label: "Calendar", title: meeting.title, meta: new Date(meeting.start_time).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }), icon: Calendar, tone: "cyan", href: base + "/work/calendar" })),
  ];

  return (
    <div className="relative -m-4 min-h-[calc(100vh-76px)] overflow-hidden bg-[#eef4ff] p-4 text-slate-950 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(82,113,255,0.34),transparent_28%),radial-gradient(circle_at_84%_12%,rgba(236,124,255,0.24),transparent_26%),radial-gradient(circle_at_52%_78%,rgba(50,214,255,0.20),transparent_36%),linear-gradient(135deg,#f8fbff_0%,#edf4ff_48%,#f9f2ff_100%)]" />
      <div className="pointer-events-none absolute left-6 top-8 h-[520px] w-[520px] rounded-full bg-blue-400/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[420px] w-[520px] rounded-full bg-fuchsia-300/25 blur-3xl" />

      <div className="relative mx-auto max-w-[1500px]">
        <section className="overflow-hidden rounded-[2.25rem] border border-white/70 bg-white/58 shadow-[0_30px_100px_rgba(42,62,130,0.22)] backdrop-blur-2xl">
          <div className="grid min-h-[430px] lg:grid-cols-[minmax(0,1.45fr)_440px]">
            <div className="relative p-6 sm:p-8 lg:p-10">
              <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"><span className="rounded-full border border-white/70 bg-white/60 px-3 py-1.5 shadow-sm">Home</span><span>/</span><span>Dashboard</span><span>/</span><span className="rounded-full border border-white/70 bg-white/60 px-3 py-1.5 shadow-sm">{today}</span></div>
              <div className="mt-10 max-w-3xl"><p className="text-[12px] font-bold uppercase tracking-[0.24em] text-blue-600">Agency Danmark cockpit</p><h1 className="mt-4 text-[42px] font-semibold leading-[0.95] tracking-[-0.055em] text-slate-950 sm:text-[58px] lg:text-[72px]">Gør dagen enkel,<span className="block bg-gradient-to-r from-blue-600 via-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">uden at miste overblik.</span></h1><p className="mt-5 max-w-xl text-[15px] leading-7 text-slate-600 sm:text-base">Hej {firstName}. Cashflow, pipeline, opgaver og teamtempo samlet i et lyst kontrolrum med klare næste handlinger.</p></div>
              <div className="mt-8 flex flex-wrap items-center gap-3"><button onClick={() => navigate(base + "/work/tasks?create=true")} className="group inline-flex h-12 items-center gap-3 rounded-full bg-slate-950 px-5 text-[13px] font-semibold text-white shadow-[0_18px_38px_rgba(15,23,42,0.25)] transition-transform hover:-translate-y-0.5">Ny opgave <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></button>{quickActions.map((action) => <button key={action.label} onClick={() => navigate(action.href)} className="inline-flex h-12 items-center gap-2 rounded-full border border-white/70 bg-white/62 px-4 text-[13px] font-semibold text-slate-700 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:bg-white/85 hover:text-slate-950"><action.icon className="h-4 w-4 text-blue-600" />{action.label}</button>)}</div>
            </div>
            <div className="relative border-t border-white/60 bg-slate-950/90 p-6 text-white lg:border-l lg:border-t-0 lg:p-8"><div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_8%,rgba(92,124,255,0.48),transparent_32%),radial-gradient(circle_at_92%_28%,rgba(244,114,255,0.30),transparent_34%)]" /><div className="relative"><div className="flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/45">Today signal</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Live drift</h2></div><span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-xl"><RadioTower className="h-5 w-5 text-cyan-200" /></span></div><div className="mt-8 grid grid-cols-2 gap-3"><SignalPill label="Leads" value={d?.leads?.newThisMonth ?? 0} loading={isLoading} /><SignalPill label="Deals" value={openDeals} loading={isLoading} /><SignalPill label="Tasks" value={activeWork} loading={isLoading} /><SignalPill label="Team" value={d?.employees?.active ?? 0} loading={isLoading} /></div><div className="mt-7 rounded-[1.75rem] border border-white/12 bg-white/8 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-xl"><p className="text-sm leading-6 text-white/72">Start med røde signaler, luk derefter dagens opgaver, og brug resten på pipeline eller fakturering.</p><div className="mt-5 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]" /><span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Systemet er klar</span></div></div></div></div>
          </div>
        </section>
        {showOnboardingBanner && <section className="mt-5 flex flex-wrap items-center gap-4 rounded-[1.75rem] border border-blue-200/70 bg-white/70 px-5 py-4 shadow-[0_18px_60px_rgba(45,77,150,0.12)] backdrop-blur-xl"><span className="grid h-10 w-10 place-items-center rounded-full bg-blue-600 text-white"><ShieldCheck className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-[14px] font-semibold text-slate-950">Færdiggør opsætningen for at åbne hele workspace.</p><p className="mt-0.5 text-[12.5px] text-slate-500">CRM, fakturering og team kan være klar på under to minutter.</p></div><button onClick={() => navigate(base + "/onboarding")} className="flex h-10 items-center gap-2 rounded-full bg-slate-950 px-4 text-[12px] font-semibold text-white">Fortsæt <ArrowRight className="h-3.5 w-3.5" /></button></section>}
        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{pulse.map((item) => <PulseMetric key={item.label} {...item} />)}</section>
        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_430px]"><div className="rounded-[2rem] border border-white/70 bg-white/64 p-4 shadow-[0_24px_80px_rgba(45,77,150,0.13)] backdrop-blur-2xl sm:p-5"><PanelHeader eyebrow="Revenue" title="Cashflow & tempo" action="Åbn fakturaer" href={base + "/finance/invoices"} /><div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]"><div className="min-h-[310px] rounded-[1.6rem] border border-white/70 bg-gradient-to-br from-slate-950 to-[#162554] p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">{d?.revenueByDay && d.revenueByDay.length > 0 ? <ResponsiveContainer width="100%" height={285}><BarChart data={d.revenueByDay} barCategoryGap="28%"><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.48)", fontSize: 11 }} /><RTooltip cursor={{ fill: "rgba(255,255,255,0.06)" }} contentStyle={{ background: "rgba(15,23,42,0.94)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 18, color: "#fff", fontSize: 12 }} formatter={(value: number) => [format(value), "Omsætning"]} /><Bar dataKey="value" radius={[12, 12, 4, 4]} maxBarSize={42}>{d.revenueByDay.map((entry, index) => <Cell key={entry.label + "-" + index} fill={AURORA_COLORS[index % AURORA_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer> : <EmptyLane title="Ingen faktureret omsætning endnu" text="Opret første faktura, så revenue-lanen begynder at vise tempo og månedlig udvikling." href={base + "/finance/invoices?create=true"} action="Opret faktura" dark />}</div><div className="rounded-[1.6rem] border border-white/70 bg-white/72 p-5 shadow-sm"><MicroStack items={[{ label: "Faktureret", value: format(monthValue) }, { label: "Udestående", value: format(overdueValue), tone: overdueValue > 0 ? "risk" : undefined }, { label: "Betalte", value: String(d?.invoices?.paid ?? 0) }, { label: "Total", value: String(d?.invoices?.total ?? 0) }]} /></div></div></div><SpotlightPanel items={spotlightItems} isLoading={isLoading} base={base} /></section>
        <section className="mt-6 grid gap-6 xl:grid-cols-3"><PipelinePanel stages={pipelineStages} base={base} /><FlowPanel icon={Calendar} title="Dagens kalender" eyebrow="Timing" emptyText="Ingen møder planlagt i dag." href={base + "/work/calendar"} isLoading={isLoading} items={meetings.map((meeting) => ({ id: meeting.id, primary: meeting.title, secondary: new Date(meeting.start_time).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }) }))} /><FlowPanel icon={CheckCircle2} title="Arbejdskø" eyebrow="Execution" emptyText="Alt er lukket for i dag." href={base + "/work/tasks"} isLoading={isLoading} items={tasks.map((task) => ({ id: task.id, primary: task.title, secondary: task.due_date ? new Date(task.due_date).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : "uden frist", tone: task.priority === "high" ? "risk" : undefined }))} /></section>
        <section className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]"><VelocityPanel leads={d?.leads?.newThisMonth ?? 0} customers={d?.customers?.total ?? 0} unread={d?.emails?.unread ?? 0} loading={isLoading} base={base} /><WorkforcePanel active={d?.employees?.active ?? 0} total={d?.employees?.total ?? 0} pending={d?.tasks?.pending ?? 0} completed={d?.tasks?.completed ?? 0} loading={isLoading} base={base} /></section>
      </div>
    </div>
  );
}

function PulseMetric({ label, value, detail, href, icon: Icon, tone }: { label: string; value: string | null; detail: string; href: string; icon: ComponentType<{ className?: string }>; tone: Tone }) {
  const toneClass = { blue: "from-blue-600 to-cyan-400 text-blue-600", violet: "from-violet-600 to-fuchsia-400 text-violet-600", cyan: "from-cyan-500 to-blue-500 text-cyan-600", risk: "from-rose-500 to-orange-400 text-rose-600" }[tone];
  return <Link to={href} className="group relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/68 p-5 shadow-[0_18px_55px_rgba(45,77,150,0.12)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:bg-white/86"><div className={cn("absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br opacity-20 blur-2xl", toneClass)} /><div className="relative flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span><span className={cn("grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg", toneClass)}><Icon className="h-4 w-4" /></span></div><div className="relative mt-5">{value === null ? <Skeleton className="h-8 w-24 rounded-full" /> : <div className="text-[28px] font-semibold leading-none tracking-[-0.04em] text-slate-950 tabular-nums">{value}</div>}<div className="mt-2 text-[12px] text-slate-500">{detail}</div></div></Link>;
}

function SignalPill({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return <div className="rounded-[1.35rem] border border-white/10 bg-white/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl"><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/42">{label}</div>{loading ? <div className="mt-4 h-7 w-14 rounded-full bg-white/10" /> : <div className="mt-4 text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{value}</div>}</div>;
}

function PanelHeader({ eyebrow, title, action, href, dark = false }: { eyebrow: string; title: string; action: string; href: string; dark?: boolean }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 px-1"><div><div className={cn("text-[10px] font-bold uppercase tracking-[0.19em]", dark ? "text-white/45" : "text-blue-600")}>{eyebrow}</div><h2 className={cn("mt-1 text-[22px] font-semibold tracking-[-0.04em]", dark ? "text-white" : "text-slate-950")}>{title}</h2></div><Link to={href} className={cn("flex h-10 items-center gap-2 rounded-full px-4 text-[12px] font-semibold transition-transform hover:-translate-y-0.5", dark ? "bg-white/10 text-white" : "bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)]")}>{action} <ArrowRight className="h-3.5 w-3.5" /></Link></div>;
}

function MicroStack({ items }: { items: { label: string; value: string; tone?: "risk" }[] }) {
  return <div className="space-y-3">{items.map((item) => <div key={item.label} className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3"><span className="text-[12px] text-slate-500">{item.label}</span><span className={cn("text-[14px] font-semibold text-slate-950 tabular-nums", item.tone === "risk" && "text-rose-600")}>{item.value}</span></div>)}</div>;
}

function SpotlightPanel({ items, isLoading, base }: { items: { id: string; label: string; title: string; meta: string; icon: ComponentType<{ className?: string }>; tone: string; href: string }[]; isLoading: boolean; base: string }) {
  return <div className="rounded-[2rem] border border-white/70 bg-white/62 p-5 shadow-[0_24px_80px_rgba(45,77,150,0.13)] backdrop-blur-2xl"><PanelHeader eyebrow="Focus" title="Dagens vigtigste" action="Alle opgaver" href={base + "/work/tasks"} /><div className="mt-5 space-y-3">{isLoading ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-[1.4rem]" />) : items.length === 0 ? <div className="rounded-[1.6rem] border border-white/70 bg-white/70 p-5"><CheckCircle2 className="h-5 w-5 text-emerald-500" /><p className="mt-3 text-[14px] leading-6 text-slate-600">Ingen presserende sager lige nu. Brug tiden på pipeline, outreach eller fakturering.</p></div> : items.slice(0, 5).map((item) => { const Icon = item.icon; return <Link key={item.id} to={item.href} className="group block rounded-[1.6rem] border border-white/70 bg-white/70 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white/90"><div className="flex gap-3"><span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-lg", item.tone === "risk" ? "bg-gradient-to-br from-rose-500 to-orange-400" : item.tone === "violet" ? "bg-gradient-to-br from-violet-600 to-fuchsia-400" : item.tone === "cyan" ? "bg-gradient-to-br from-cyan-500 to-blue-500" : "bg-gradient-to-br from-blue-600 to-indigo-500")}><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{item.label}</p><p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-5 text-slate-900">{item.title}</p><p className="mt-2 text-[12px] text-blue-600">{item.meta} →</p></div></div></Link>; })}</div></div>;
}

function PipelinePanel({ stages, base }: { stages: { name: string; count: number; color: string }[]; base: string }) {
  return <div className="rounded-[2rem] border border-white/70 bg-white/62 p-5 shadow-[0_24px_80px_rgba(45,77,150,0.11)] backdrop-blur-2xl"><PanelHeader eyebrow="Sales" title="Pipeline health" action="Åbn" href={base + "/crm/deals?view=board"} /><div className="mt-5 rounded-[1.6rem] border border-white/70 bg-white/70 p-5">{stages.length > 0 ? <div className="grid grid-cols-[124px_1fr] gap-5"><div className="h-[124px] w-[124px] rounded-full bg-slate-950/5 p-2"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={stages} dataKey="count" nameKey="name" innerRadius={38} outerRadius={56} paddingAngle={3} stroke="none">{stages.map((stage, index) => <Cell key={stage.name} fill={stage.color || AURORA_COLORS[index % AURORA_COLORS.length]} />)}</Pie><RTooltip contentStyle={{ background: "rgba(255,255,255,0.96)", border: "1px solid rgba(148,163,184,0.3)", borderRadius: 16, fontSize: 12 }} /></PieChart></ResponsiveContainer></div><div className="min-w-0 space-y-3 self-center">{stages.map((stage, index) => <div key={stage.name}><div className="flex items-center justify-between gap-2 text-[12px]"><span className="truncate text-slate-500">{stage.name}</span><span className="font-semibold text-slate-900 tabular-nums">{stage.count}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200/70"><div className="h-full rounded-full" style={{ width: Math.min(100, Math.max(10, stage.count * 14)) + "%", background: stage.color || AURORA_COLORS[index % AURORA_COLORS.length] }} /></div></div>)}</div></div> : <EmptyLane title="Ingen pipeline endnu" text="Opret første deal for at se salgsmomentum, stadier og pres." href={base + "/crm/deals?create=true"} action="Opret deal" />}</div></div>;
}

function FlowPanel({ icon: Icon, eyebrow, title, emptyText, href, items, isLoading }: { icon: ComponentType<{ className?: string }>; eyebrow: string; title: string; emptyText: string; href: string; items: { id: string; primary: string; secondary: string; tone?: "risk" }[]; isLoading: boolean }) {
  return <div className="rounded-[2rem] border border-white/70 bg-white/62 p-5 shadow-[0_24px_80px_rgba(45,77,150,0.11)] backdrop-blur-2xl"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.16)]"><Icon className="h-4 w-4" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</p><h2 className="mt-1 text-[18px] font-semibold tracking-[-0.035em] text-slate-950">{title}</h2></div></div><Link to={href} className="rounded-full border border-white/70 bg-white/70 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 hover:text-blue-600">Alle</Link></div><div className="mt-5 rounded-[1.6rem] border border-white/70 bg-white/70 p-4">{isLoading ? <div className="space-y-2.5">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-11 w-full rounded-2xl" />)}</div> : items.length === 0 ? <p className="text-[13px] leading-6 text-slate-500">{emptyText}</p> : <ul className="space-y-2">{items.slice(0, 5).map((item) => <li key={item.id} className="flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-3"><span className={cn("h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_14px_currentColor]", item.tone === "risk" ? "bg-rose-500 text-rose-500" : "bg-blue-500 text-blue-500")} /><span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800">{item.primary}</span><span className="text-[11px] text-slate-400 tabular-nums">{item.secondary}</span></li>)}</ul>}</div></div>;
}

function VelocityPanel({ leads, customers, unread, loading, base }: { leads: number; customers: number; unread: number; loading: boolean; base: string }) {
  const data = [{ label: "Leads", v: leads }, { label: "Kunder", v: customers }, { label: "Inbox", v: unread }];
  return <div className="rounded-[2rem] border border-white/70 bg-white/62 p-5 shadow-[0_24px_80px_rgba(45,77,150,0.11)] backdrop-blur-2xl"><PanelHeader eyebrow="Market" title="Go-to-market tempo" action="Åbn leads" href={base + "/crm/leads"} /><div className="mt-5 grid gap-4 md:grid-cols-[1fr_240px]"><div className="h-[210px] rounded-[1.6rem] border border-white/70 bg-white/70 p-4">{loading ? <Skeleton className="h-full w-full rounded-[1.3rem]" /> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={data}><defs><linearGradient id="market-tempo-light" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5b7cfa" stopOpacity={0.36} /><stop offset="100%" stopColor="#5b7cfa" stopOpacity={0.02} /></linearGradient></defs><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} /><Area type="monotone" dataKey="v" stroke="#5b7cfa" strokeWidth={3} fill="url(#market-tempo-light)" isAnimationActive={false} /></AreaChart></ResponsiveContainer>}</div><div className="rounded-[1.6rem] border border-white/70 bg-white/72 p-5"><MicroStack items={[{ label: "Nye leads", value: String(leads) }, { label: "Kunder", value: String(customers) }, { label: "Ulæste mails", value: String(unread), tone: unread > 0 ? "risk" : undefined }]} /></div></div></div>;
}

function WorkforcePanel({ active, total, pending, completed, loading, base }: { active: number; total: number; pending: number; completed: number; loading: boolean; base: string }) {
  return <div className="rounded-[2rem] border border-white/70 bg-slate-950 p-5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]"><PanelHeader eyebrow="People" title="Team og eksekvering" action="Åbn HR" href={base + "/hr/workforce"} dark /><div className="mt-5 grid grid-cols-2 gap-3"><CompactNumber icon={Users} label="Aktive" value={active} loading={loading} /><CompactNumber icon={Users} label="Team" value={total} loading={loading} /><CompactNumber icon={Clock3} label="Afventer" value={pending} loading={loading} tone={pending > 8 ? "risk" : undefined} /><CompactNumber icon={ShieldCheck} label="Lukket" value={completed} loading={loading} /></div></div>;
}

function CompactNumber({ icon: Icon, label, value, loading, tone }: { icon: ComponentType<{ className?: string }>; label: string; value: number; loading: boolean; tone?: "risk" }) {
  return <div className="rounded-[1.35rem] border border-white/10 bg-white/8 p-4"><Icon className={cn("h-4 w-4", tone === "risk" ? "text-rose-300" : "text-cyan-200")} />{loading ? <div className="mt-5 h-8 w-16 rounded-full bg-white/10" /> : <div className={cn("mt-5 text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums", tone === "risk" && "text-rose-300")}>{value}</div>}<div className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/42">{label}</div></div>;
}

function EmptyLane({ title, text, href, action, dark = false }: { title: string; text: string; href: string; action: string; dark?: boolean }) {
  return <div className={cn("flex min-h-[180px] flex-col justify-center rounded-[1.35rem] border border-dashed p-6", dark ? "border-white/18 bg-white/5" : "border-slate-300/70 bg-white/60")}><p className={cn("text-[15px] font-semibold", dark ? "text-white" : "text-slate-950")}>{title}</p><p className={cn("mt-2 max-w-md text-[13px] leading-6", dark ? "text-white/62" : "text-slate-500")}>{text}</p><Link to={href} className={cn("mt-4 flex w-fit items-center gap-1 rounded-full px-4 py-2 text-[12px] font-semibold", dark ? "bg-white/10 text-white" : "bg-slate-950 text-white")}>{action} <ArrowRight className="h-3.5 w-3.5" /></Link></div>;
}
