import { useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { GrowthNotInstalledError } from '@/hooks/api/useGrowthOs';
import { useGa4Daily } from '@/hooks/api/useGrowthAnalytics';
import {
  type SeoDraft, type SeoRun, type SeoSite, useConfigureSeoSite, useDecideSeoDraft, useRunSeoAutopilot, useSeoChanges, useSeoDrafts,
  useSeoFindings, useSeoReports, useSeoRuns, useSeoSite, useSeoTasks, useSetSeoAutoPublish, useUnpublishSeoDraft,
} from '@/hooks/api/useSeoAutopilot';
import { cn } from '@/lib/utils';
import { STAGES, inferStage } from './seoStage';
import './seo-mission-control.css';

// SEO autopilot "mission control": the dashboard the standalone autopilot had
// on localhost:4317, fed by the Growth OS tables instead of a local SQLite file.
// Everything shown comes from stored rows; nothing is estimated in the browser.

type T = (k: string, vars?: Record<string, string | number>) => string;
const withVars = (t: (k: string) => string): T => (k, vars) => t(k).replace(/\{(\w+)\}/g, (_, n: string) => String(vars?.[n] ?? ''));
const isRole = (roles: { role: string }[], allowed: string[]) => roles.some((r) => allowed.includes(r.role));
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('da-DK') : '—');
const shortWhen = (iso: string) => new Date(iso).toLocaleString('da-DK', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const path = (url: string) => url.replace(/^https?:\/\/[^/]+/, '') || '/';
const SEV_ORDER = ['high', 'medium', 'low'] as const;

const SITE_URL = 'https://www.aiagencydanmark.dk';
const guideUrl = (slug: string) => `${SITE_URL}/da/guide${slug}`;

// ── pipeline (stages and inference live in seoStage.ts) ──────────────────

function Card({ title, right, children, className }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mc-card', className)}>
      <div className="mc-card-head"><h3>{title}</h3>{right}</div>
      {children}
    </section>
  );
}
const Empty = ({ children }: { children: ReactNode }) => <div className="mc-empty">{children}</div>;

// ── hero + pipeline ────────────────────────────────────────────────────────
function Hero({ t, site, running, stage, lastRun }: { t: T; site: SeoSite; running: boolean; stage: number; lastRun?: SeoRun }) {
  const next = site.last_run_at ? new Date(Date.parse(site.last_run_at) + site.crawl_every_hours * 3_600_000).toISOString() : null;
  const state = running ? 'working' : site.enabled ? 'idle' : 'paused';
  const icon = running ? (stage >= 0 ? STAGES[stage].icon : '⚙️') : site.enabled ? '😴' : '⏸️';
  const title = running
    ? t('growthOs.seo.mc.hero.working', { step: stage >= 0 ? t(`growthOs.seo.mc.stage.${STAGES[stage].key}`) : t('growthOs.seo.mc.hero.round') })
    : site.enabled ? t('growthOs.seo.mc.hero.idle') : t('growthOs.seo.mc.hero.paused');
  const sub = running
    ? (stage >= 0 ? t(`growthOs.seo.mc.stageHint.${STAGES[stage].key}`) : t('growthOs.seo.mc.hero.roundHint'))
    : site.enabled
      ? t('growthOs.seo.mc.hero.next', { at: next ? when(next) : '—' }) + (lastRun?.summary ? ` · ${t('growthOs.seo.mc.hero.last')}: ${lastRun.summary}` : '')
      : t('growthOs.seo.mc.hero.pausedHint');
  return (
    <section className={cn('mc-hero', state)} aria-live="polite">
      <div className="mc-hero-icon" aria-hidden>{icon}</div>
      <div className="min-w-0"><div className="mc-hero-title">{title}</div><div className="mc-hero-sub">{sub}</div></div>
    </section>
  );
}

function Pipeline({ t, running, stage, paused }: { t: T; running: boolean; stage: number; paused: boolean }) {
  const xs = [90, 295, 500, 705, 910];
  const caption = running
    ? (stage >= 0 ? t(`growthOs.seo.mc.stageHint.${STAGES[stage].key}`) : t('growthOs.seo.mc.hero.roundHint'))
    : paused ? t('growthOs.seo.mc.pipeline.paused') : t('growthOs.seo.mc.pipeline.idle');
  return (
    <Card title={t('growthOs.seo.mc.pipeline.title')} right={<span className="mc-muted text-xs">{caption}</span>}>
      <svg className={cn('mc-pipeline', !running && 'idle')} viewBox="0 0 1000 140" preserveAspectRatio="xMidYMid meet" role="img" aria-label={caption}>
        <path id="mc-flow" className="track" d="M90,55 H910" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <circle key={i} className="particle" r="5" cx="0" cy="0">
            <animateMotion dur="6s" begin={`${i}s`} repeatCount="indefinite"><mpath href="#mc-flow" /></animateMotion>
          </circle>
        ))}
        {STAGES.map((s, i) => (
          <g key={s.key} className={cn('node', running && i === stage && 'active', running && stage >= 0 && i < stage && 'done')} transform={`translate(${xs[i]},55)`}>
            <circle className="ring" r="22" /><circle className="base" r="22" />
            <text className="icon" y="1">{s.icon}</text>
            <text className="label" y="44">{t(`growthOs.seo.mc.stage.${s.key}`)}</text>
          </g>
        ))}
      </svg>
    </Card>
  );
}

// ── charts (plain SVG, like the original) ──────────────────────────────────
function LineChart({ series, max, label }: { series: { values: number[]; stroke: string; fill?: boolean; width?: number; opacity?: number }[]; max: number; label: string }) {
  const w = 1000, h = 130, padX = 10, padY = 16;
  const n = Math.max(...series.map((s) => s.values.length));
  const x = (i: number) => (n === 1 ? w / 2 : padX + (i / (n - 1)) * (w - padX * 2));
  const y = (v: number) => h - padY - (v / Math.max(1, max)) * (h - padY * 2);
  return (
    <svg className="mc-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <defs><linearGradient id="mc-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--mc-accent)" stopOpacity="0.35" /><stop offset="100%" stopColor="var(--mc-accent)" stopOpacity="0" /></linearGradient></defs>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={padX} x2={w - padX} y1={y(f * max)} y2={y(f * max)} stroke="var(--mc-border-soft)" strokeWidth={1} />)}
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
        return (
          <g key={si}>
            {s.fill && <polygon points={`${padX},${h - padY} ${pts.join(' ')} ${x(s.values.length - 1).toFixed(1)},${h - padY}`} fill="url(#mc-fill)" />}
            <polyline points={pts.join(' ')} fill="none" stroke={s.stroke} strokeWidth={s.width ?? 2.5} strokeLinejoin="round" strokeLinecap="round" opacity={s.opacity ?? 1} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
  );
}

// ── findings + changes ─────────────────────────────────────────────────────
function Expandable<R>({ rows, limit = 8, t, render }: { rows: R[]; limit?: number; t: T; render: (rows: R[]) => ReactNode }) {
  const [all, setAll] = useState(false);
  return (
    <>
      {render(all ? rows : rows.slice(0, limit))}
      {rows.length > limit && (
        <div className="mt-2"><button type="button" className="mc-btn small" onClick={() => setAll(!all)}>{all ? t('growthOs.seo.mc.showLess') : t('growthOs.seo.mc.showAll', { n: rows.length })}</button></div>
      )}
    </>
  );
}

// ── drafts ─────────────────────────────────────────────────────────────────
function draftState(d: SeoDraft): 'live' | 'offline' | 'approved' | 'rejected' | 'pending' | 'failed' {
  if (d.published_at && !d.unpublished_at) return 'live';
  if (d.unpublished_at) return 'offline';
  if (d.decision !== 'pending') return d.decision;
  return d.review_status === 'failed' ? 'failed' : 'pending';
}

function Draft({ d, t, canDecide }: { d: SeoDraft; t: T; canDecide: boolean }) {
  const [open, setOpen] = useState(false);
  const decide = useDecideSeoDraft();
  const unpublish = useUnpublishSeoDraft();
  const state = draftState(d);
  const live = state === 'live';
  return (
    <div className={cn('mc-draft', `s-${state === 'offline' ? 'rejected' : state === 'failed' ? 'rejected' : state}`)}>
      <div className="mc-draft-head">
        <div className="min-w-0 space-y-1">
          <div><strong>{d.title}</strong> <span className="mc-muted">({t(`growthOs.seo.kind.${d.kind}`)}{d.slug ? ` · ${d.slug}` : ''})</span></div>
          <div className="mc-row" style={{ gap: 6 }}>
            <span className={cn('mc-badge', state === 'live' ? 'live' : state === 'offline' ? 'neutral' : state)}>{t(`growthOs.seo.mc.draftState.${state}`)}</span>
            {d.review_score !== null && <span className="mc-muted text-xs">{t('growthOs.seo.mc.score', { s: d.review_score })}</span>}
            {live && d.published_by && <span className="mc-muted text-xs">{t(d.published_by === 'autopilot' ? 'growthOs.seo.publish.liveAuto' : 'growthOs.seo.publish.live')}</span>}
            <span className="mc-muted-2 text-xs">{when(d.created_at)}</span>
          </div>
        </div>
        <div className="mc-row">
          <button type="button" className="mc-btn small" onClick={() => setOpen(!open)}>{open ? t('growthOs.seo.hide') : t('growthOs.seo.read')}</button>
          {canDecide && d.decision === 'pending' && d.review_status !== 'pending' && (
            <>
              <button type="button" className="mc-btn small primary" disabled={decide.isPending} onClick={() => decide.mutate({ id: d.id, approve: true })}>{t(d.kind === 'page' ? 'growthOs.seo.publish.approvePublish' : 'growthOs.seo.approve')}</button>
              <button type="button" className="mc-btn small" disabled={decide.isPending} onClick={() => decide.mutate({ id: d.id, approve: false })}>{t('growthOs.seo.reject')}</button>
            </>
          )}
          {canDecide && live && <button type="button" className="mc-btn small" disabled={unpublish.isPending} onClick={() => unpublish.mutate(d.id)}>{t('growthOs.seo.publish.unpublish')}</button>}
        </div>
      </div>
      {d.publish_block_reason && <p className="mc-warn-text mt-2 text-xs">{t('growthOs.seo.publish.blocked', { reason: d.publish_block_reason })}</p>}
      {live && d.slug && <p className="mt-2 text-xs"><a href={guideUrl(d.slug)} target="_blank" rel="noreferrer">{guideUrl(d.slug)}</a></p>}
      {(decide.error || unpublish.error) && <p className="mc-err-text mt-2 text-xs">{((decide.error ?? unpublish.error) as Error).message}</p>}
      {open && (
        <div className="mt-3 space-y-1 text-sm">
          {d.meta_description && <p className="mc-muted"><strong>Meta:</strong> {d.meta_description}</p>}
          {d.h1 && <p className="mc-muted"><strong>H1:</strong> {d.h1}</p>}
          {d.summary && <p className="mc-muted"><strong>{t('growthOs.seo.mc.summary')}:</strong> {d.summary}</p>}
          {d.review_notes && <p className="mc-muted"><strong>{t('growthOs.seo.reviewNotes')}:</strong> {d.review_notes}</p>}
          <pre className="mc-pre">{d.body || '—'}</pre>
          <p className="mc-muted-2 text-xs">{t('growthOs.seo.models', { w: d.worker_model ?? '—', r: d.review_model ?? '—' })}</p>
        </div>
      )}
    </div>
  );
}

type DraftFilter = 'waiting' | 'live' | 'approved' | 'rejected' | 'all';
function DraftQueue({ t, drafts, canDecide }: { t: T; drafts: SeoDraft[]; canDecide: boolean }) {
  const [filter, setFilter] = useState<DraftFilter>('waiting');
  const list = drafts.filter((d) => {
    const s = draftState(d);
    return filter === 'all' || (filter === 'waiting' ? s === 'pending' : filter === 'live' ? s === 'live' : filter === 'rejected' ? s === 'rejected' || s === 'failed' : s === 'approved');
  });
  return (
    <Card title={t('growthOs.seo.mc.drafts')} right={
      <select aria-label={t('growthOs.seo.mc.drafts')} value={filter} onChange={(e) => setFilter(e.target.value as DraftFilter)}>
        {(['waiting', 'live', 'approved', 'rejected', 'all'] as const).map((f) => <option key={f} value={f}>{t(`growthOs.seo.mc.filter.${f}`)}</option>)}
      </select>
    }>
      <p className="mc-muted mb-3 text-xs">{t('growthOs.seo.draftsHint')}</p>
      {!list.length ? <Empty>{t('growthOs.seo.mc.noDrafts')}</Empty> : <div className="mc-scroll">{list.slice(0, 40).map((d) => <Draft key={d.id} d={d} t={t} canDecide={canDecide} />)}</div>}
    </Card>
  );
}

// ── settings ───────────────────────────────────────────────────────────────
function Settings({ t, site, isAdmin }: { t: T; site: SeoSite | null; isAdmin: boolean }) {
  const [url, setUrl] = useState(site?.site_url ?? '');
  const [enabled, setEnabled] = useState(site?.enabled ?? true);
  const [hours, setHours] = useState(String(site?.crawl_every_hours ?? 6));
  const [calls, setCalls] = useState(String(site?.llm_calls_per_day ?? 12));
  const [facts, setFacts] = useState(site?.product_facts ?? '');
  const [autoOn, setAutoOn] = useState(site?.auto_publish ?? false);
  const [minScore, setMinScore] = useState(String(site?.publish_min_score ?? 8));
  const [perDay, setPerDay] = useState(String(site?.max_publish_per_day ?? 1));
  const save = useConfigureSeoSite();
  const savePublish = useSetSeoAutoPublish();
  if (!isAdmin) return <Card title={t('growthOs.seo.mc.settings')}><p className="mc-muted text-sm">{t('growthOs.seo.setup.adminOnly')}</p></Card>;
  return (
    <Card title={t('growthOs.seo.mc.settings')}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate({ siteUrl: url, enabled, crawlEveryHours: Number(hours), llmCallsPerDay: Number(calls), productFacts: facts }); }}>
        <div className="mc-field"><label className="mc-label" htmlFor="mc-site">{t('growthOs.seo.setup.site')}</label><input id="mc-site" type="url" className="w-full" placeholder="https://www.example.dk" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="mc-field"><label className="mc-label" htmlFor="mc-hours">{t('growthOs.seo.setup.every')}</label><input id="mc-hours" type="number" className="w-full" min={1} max={168} value={hours} onChange={(e) => setHours(e.target.value)} /></div>
          <div className="mc-field"><label className="mc-label" htmlFor="mc-calls">{t('growthOs.seo.setup.calls')}</label><input id="mc-calls" type="number" className="w-full" min={0} max={40} value={calls} onChange={(e) => setCalls(e.target.value)} /></div>
        </div>
        <div className="mc-field">
          <label className="mc-label" htmlFor="mc-facts">{t('growthOs.seo.setup.facts')}</label>
          <textarea id="mc-facts" className="w-full" rows={4} maxLength={4000} value={facts} onChange={(e) => setFacts(e.target.value)} />
          <p className="mc-muted-2 mt-1 text-xs">{t('growthOs.seo.setup.factsHint')}</p>
        </div>
        <div className="mc-row mb-1">
          <label className="mc-switch"><input type="checkbox" checked={!enabled} onChange={(e) => setEnabled(!e.target.checked)} />{t('growthOs.seo.mc.pause')}</label>
          <button type="submit" className="mc-btn primary" disabled={save.isPending}>{t('growthOs.seo.setup.save')}</button>
          {save.isSuccess && <span className="mc-ok-text text-xs">{t('growthOs.seo.setup.saved')}</span>}
        </div>
        {save.error && <p className="mc-err-text text-xs">{(save.error as Error).message}</p>}
      </form>
      {site && (
        <form className="mt-5 border-t pt-4" style={{ borderColor: 'var(--mc-border)' }} onSubmit={(e) => { e.preventDefault(); savePublish.mutate({ enabled: autoOn, minScore: Number(minScore), maxPerDay: Number(perDay) }); }}>
          <label className="mc-label">{t('growthOs.seo.publish.title')}</label>
          <ul className="mc-muted mb-3 list-disc space-y-1 pl-5 text-xs">
            <li>{t('growthOs.seo.publish.rule1')}</li><li>{t('growthOs.seo.publish.rule2')}</li><li>{t('growthOs.seo.publish.rule3')}</li>
          </ul>
          <div className="mc-row">
            <label className="mc-switch"><input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} />{t('growthOs.seo.publish.switch')}</label>
            <label className="mc-switch">{t('growthOs.seo.publish.minScore')}<input type="number" className="w-16" min={6} max={10} value={minScore} onChange={(e) => setMinScore(e.target.value)} /></label>
            <label className="mc-switch">{t('growthOs.seo.publish.perDay')}<input type="number" className="w-16" min={0} max={5} value={perDay} onChange={(e) => setPerDay(e.target.value)} /></label>
            <button type="submit" className="mc-btn primary" disabled={savePublish.isPending}>{t('growthOs.seo.setup.save')}</button>
            {savePublish.isSuccess && <span className="mc-ok-text text-xs">{t('growthOs.seo.setup.saved')}</span>}
          </div>
          {savePublish.error && <p className="mc-err-text mt-1 text-xs">{(savePublish.error as Error).message}</p>}
          <p className="mc-muted-2 mt-2 text-xs">
            {site.auto_publish ? t('growthOs.seo.publish.statusOn', { since: when(site.auto_publish_since) }) : t('growthOs.seo.publish.statusOff')}
            {' · '}<a href={`${SITE_URL}/da/guide`} target="_blank" rel="noreferrer">{t('growthOs.seo.publish.viewGuides')}</a>
          </p>
        </form>
      )}
      <p className="mc-muted-2 mt-3 text-xs">{t('growthOs.seo.setup.freeNote')}</p>
    </Card>
  );
}

// ── page ───────────────────────────────────────────────────────────────────
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function SeoAutopilot({ t: rawT }: { t: (k: string) => string }) {
  const t = useMemo(() => withVars(rawT), [rawT]);
  const { roles } = useAuth();
  const isAdmin = isRole(roles, ['owner', 'company_admin']);
  const site = useSeoSite();
  const runs = useSeoRuns();
  const drafts = useSeoDrafts();
  const tasks = useSeoTasks();
  const reports = useSeoReports();
  const run = useRunSeoAutopilot();
  const [from, to] = useMemo(() => [isoDay(Date.now() - 30 * 86_400_000), isoDay(Date.now())], []);
  const ga4 = useGa4Daily(from, to, !!site.data);

  const allRuns = useMemo(() => runs.data ?? [], [runs.data]);
  const loops = allRuns.filter((r) => r.kind === 'loop');
  const crawled = loops.filter((r) => r.status === 'ok' && (r.pages ?? 0) > 0);
  const last = crawled[0];
  const prev = crawled[1];
  const findings = useSeoFindings(last?.id);
  const changeRuns = crawled.filter((r) => (r.changes ?? 0) > 0).slice(0, 5).map((r) => r.id);
  const changes = useSeoChanges(changeRuns);
  const [logRun, setLogRun] = useState<string>('');
  const [historyType, setHistoryType] = useState<'' | 'run' | 'task' | 'draft' | 'report'>('');

  if ([site, runs].some((q) => q.error instanceof GrowthNotInstalledError)) {
    return <div className="seo-mc"><div className="mc-main"><Empty>{t('growthOs.seo.notInstalled')}</Empty></div></div>;
  }
  if (site.isLoading) {
    return <div className="seo-mc"><div className="mc-main"><Empty>{t('growthOs.seo.mc.loading')}</Empty></div></div>;
  }
  if (site.error) {
    return <div className="seo-mc"><div className="mc-main"><p className="mc-err-text text-sm">{(site.error as Error).message}</p></div></div>;
  }

  const s = site.data;
  const running = allRuns.find((r) => r.status === 'running');
  const stage = running ? inferStage(running.log ?? []) : -1;
  const draftList = drafts.data ?? [];
  const pendingDrafts = draftList.filter((d) => draftState(d) === 'pending').length;
  const liveDrafts = draftList.filter((d) => draftState(d) === 'live').length;
  const taskList = tasks.data ?? [];
  const openTasks = taskList.filter((x) => x.status === 'open').length;
  const cost = allRuns.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
  const calls = allRuns.reduce((a, r) => a + (r.llm_calls ?? 0), 0);
  const models = [...new Set(allRuns.flatMap((r) => r.models ?? []))];
  const findingRows = (findings.data ?? []).slice().sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  const bySev = (sev: string) => findingRows.filter((f) => f.severity === sev).length;
  const scoreDelta = last && prev && last.score !== null && prev.score !== null ? last.score - prev.score : null;
  const scored = [...crawled].reverse().filter((r) => r.score !== null);
  const selectedRun = allRuns.find((r) => r.id === logRun) ?? allRuns[0];

  const organic = new Map<string, { all: number; organic: number }>();
  for (const r of ga4.data ?? []) {
    const e = organic.get(r.day) ?? { all: 0, organic: 0 };
    e.all += r.sessions;
    if (r.channel_group === 'Organic Search') e.organic += r.sessions;
    organic.set(r.day, e);
  }
  const traffic = [...organic.entries()].sort(([a], [b]) => a.localeCompare(b));

  type Ev = { type: 'run' | 'task' | 'draft' | 'report'; at: string; title: string; detail?: string; tone: 'ok' | 'error' | 'running' | '' };
  const history: Ev[] = [
    ...allRuns.map((r): Ev => ({ type: 'run', at: r.started_at, title: t('growthOs.seo.mc.history.runTitle', { kind: r.kind.toUpperCase(), status: t(`growthOs.seo.runStatus.${r.status}`) }), detail: r.error ?? r.summary ?? undefined, tone: r.status === 'ok' ? 'ok' : r.status === 'error' ? 'error' : 'running' })),
    ...taskList.map((x): Ev => ({ type: 'task', at: x.created_at, title: x.title, detail: `${t(`growthOs.seo.type.${x.type}`)} · ${t(`growthOs.seo.taskStatus.${x.status}`)}${x.error ? ` · ${x.error}` : ''}`, tone: x.status === 'done' ? 'ok' : x.status === 'failed' ? 'error' : 'running' })),
    ...draftList.map((d): Ev => { const st = draftState(d); return { type: 'draft', at: d.published_at ?? d.decided_at ?? d.created_at, title: d.title, detail: t(`growthOs.seo.mc.draftState.${st}`) + (d.review_score !== null ? ` · ${t('growthOs.seo.mc.score', { s: d.review_score })}` : ''), tone: st === 'live' || st === 'approved' ? 'ok' : st === 'rejected' || st === 'failed' ? 'error' : 'running' }; }),
    ...(reports.data ?? []).map((r): Ev => ({ type: 'report', at: r.created_at, title: r.title, detail: r.kind.toUpperCase(), tone: '' })),
  ].filter((e) => !historyType || e.type === historyType).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);
  const HISTORY_ICON = { run: '🔁', task: '🗂️', draft: '📝', report: '🛰️' } as const;

  return (
    <div className="seo-mc">
      <header className="mc-header">
        <div className="mc-brand">
          <div className="mc-mark" aria-hidden>🛰️</div>
          <div><h2>{t('growthOs.seo.title')}</h2><div className="mc-muted-2 text-xs">{s ? t('growthOs.seo.mc.watching', { site: s.site_url }) : t('growthOs.seo.mc.notSetUp')}</div></div>
        </div>
        {s && (
          <div className="mc-row">
            <span className="mc-row" style={{ gap: 6 }}>
              <span className={cn('mc-dot', running ? 'running' : s.enabled ? 'ok' : 'error')} />
              <span className="mc-muted text-xs">{running ? t('growthOs.seo.running') : s.enabled ? t('growthOs.seo.mc.ready') : t('growthOs.seo.kpi.paused')}</span>
            </span>
            {isRole(roles, ['owner', 'company_admin', 'manager']) && (
              <button type="button" className="mc-btn small primary" disabled={run.isPending || !!running} onClick={() => run.mutate('SEO autopilot round started from the Growth OS page')}>
                {running ? t('growthOs.seo.running') : t('growthOs.seo.runNow')}
              </button>
            )}
          </div>
        )}
      </header>

      <div className="mc-main">
        {run.isSuccess && <p className="mc-ok-text text-sm">{t('growthOs.seo.queued')}</p>}
        {run.error && <p className="mc-err-text text-sm">{(run.error as Error).message}</p>}

        {!s ? <Settings t={t} site={null} isAdmin={isAdmin} /> : (
          <>
            <Hero t={t} site={s} running={!!running} stage={stage} lastRun={loops[0]} />

            <div className="mc-kpis">
              <div className="mc-kpi score">
                <div className="mc-kpi-label">{t('growthOs.seo.kpi.score')}</div>
                <div className="mc-kpi-value">{last?.score ?? '—'}<span className="mc-kpi-unit">/100</span></div>
                <div className={cn('mc-kpi-note', scoreDelta !== null && scoreDelta > 0 && 'up', scoreDelta !== null && scoreDelta < 0 && 'down')}>
                  {scoreDelta === null ? t('growthOs.seo.kpi.noPrevious') : scoreDelta === 0 ? t('growthOs.seo.mc.unchanged') : t('growthOs.seo.kpi.delta', { d: `${scoreDelta > 0 ? '+' : ''}${scoreDelta}` })}
                </div>
              </div>
              <div className="mc-kpi"><div className="mc-kpi-label">{t('growthOs.seo.kpi.pages')}</div><div className="mc-kpi-value">{last?.pages ?? '—'}</div><div className="mc-kpi-note">{last ? t('growthOs.seo.kpi.crawled', { at: shortWhen(last.started_at) }) : ''}</div></div>
              <div className="mc-kpi">
                <div className="mc-kpi-label">{t('growthOs.seo.mc.openFindings')}</div><div className="mc-kpi-value">{last ? findingRows.length || last.findings || 0 : '—'}</div>
                <div className="mc-row mt-2" style={{ gap: 4 }}>{SEV_ORDER.filter((x) => bySev(x) > 0).map((x) => <span key={x} className={cn('mc-badge', x)}>{bySev(x)} {t(`growthOs.seo.sev.${x}`)}</span>)}</div>
              </div>
              <div className="mc-kpi"><div className="mc-kpi-label">{t('growthOs.seo.mc.draftsWaiting')}</div><div className="mc-kpi-value">{pendingDrafts}</div><div className="mc-kpi-note">{t('growthOs.seo.mc.liveCount', { n: liveDrafts })}</div></div>
              <div className="mc-kpi"><div className="mc-kpi-label">{t('growthOs.seo.mc.openTasks')}</div><div className="mc-kpi-value">{openTasks}</div><div className="mc-kpi-note">{t('growthOs.seo.mc.ofTotal', { n: taskList.length })}</div></div>
              <div className="mc-kpi"><div className="mc-kpi-label">{t('growthOs.seo.mc.cost')}</div><div className="mc-kpi-value">${cost.toFixed(3)}</div><div className="mc-kpi-note">{t('growthOs.seo.mc.calls', { n: calls })}</div></div>
            </div>

            <Pipeline t={t} running={!!running} stage={stage} paused={!s.enabled} />

            <Card title={t('growthOs.seo.chart')}>
              {scored.length === 0 ? <Empty>{t('growthOs.seo.mc.noRuns')}</Empty> : (
                <>
                  <LineChart label={t('growthOs.seo.chart')} max={100} series={[{ values: scored.map((r) => r.score as number), stroke: 'var(--mc-accent)', fill: true }]} />
                  <div className="mc-legend">{t('growthOs.seo.mc.scoreLegend', { s: scored[scored.length - 1].score ?? '—', at: when(scored[scored.length - 1].started_at), n: scored.length })}</div>
                </>
              )}
            </Card>

            <div className="mc-grid-2">
              <Card title={t('growthOs.seo.findingsTitle')}>
                {!findingRows.length ? <Empty>{last ? t('growthOs.seo.mc.noFindings') : t('growthOs.seo.mc.noRuns')}</Empty> : (
                  <Expandable rows={findingRows} t={t} render={(rows) => (
                    <div className="mc-table-wrap"><table>
                      <thead><tr><th>{t('growthOs.seo.col.page')}</th><th>{t('growthOs.seo.col.severity')}</th><th>{t('growthOs.seo.col.issue')}</th><th>{t('growthOs.seo.col.fix')}</th></tr></thead>
                      <tbody>{rows.map((f) => <tr key={f.id}><td title={f.url}>{path(f.url)}</td><td><span className={cn('mc-badge', f.severity)}>{t(`growthOs.seo.sev.${f.severity}`)}</span></td><td>{f.issue}</td><td className="mc-muted">{f.fix}</td></tr>)}</tbody>
                    </table></div>
                  )} />
                )}
              </Card>
              <Card title={t('growthOs.seo.changesTitle')}>
                {!changes.data?.length ? <Empty>{t('growthOs.seo.noChanges')}</Empty> : (
                  <Expandable rows={changes.data} t={t} render={(rows) => (
                    <div className="mc-table-wrap"><table>
                      <thead><tr><th>{t('growthOs.seo.col.page')}</th><th>{t('growthOs.seo.col.field')}</th><th>{t('growthOs.seo.col.before')}</th><th>{t('growthOs.seo.col.after')}</th></tr></thead>
                      <tbody>{rows.map((c) => <tr key={c.id}><td title={c.url}>{path(c.url)}</td><td>{c.field}</td><td className="mc-muted" title={c.before ?? ''}>{(c.before ?? '—').slice(0, 40)}</td><td title={c.after ?? ''}>{(c.after ?? '—').slice(0, 40)}</td></tr>)}</tbody>
                    </table></div>
                  )} />
                )}
              </Card>
            </div>

            <DraftQueue t={t} drafts={draftList} canDecide={isAdmin} />

            <div className="mc-grid-2">
              <Card title={t('growthOs.seo.tab.tasks')}>
                {!taskList.length ? <Empty>{t('growthOs.seo.none')}</Empty> : (
                  <div className="mc-table-wrap mc-scroll"><table>
                    <thead><tr><th>{t('growthOs.seo.col.task')}</th><th>{t('growthOs.seo.col.type')}</th><th>{t('growthOs.seo.col.status')}</th><th>{t('growthOs.seo.mc.attempts')}</th></tr></thead>
                    <tbody>{taskList.slice(0, 20).map((x) => (
                      <tr key={x.id}>
                        <td><div>{x.title}</div>{x.error && <div className="mc-err-text text-xs">{x.error}</div>}</td>
                        <td className="mc-muted">{t(`growthOs.seo.type.${x.type}`)}</td>
                        <td><span className={cn('mc-badge', x.status === 'done' ? 'done' : x.status === 'failed' ? 'failed' : 'open')}>{t(`growthOs.seo.taskStatus.${x.status}`)}</span></td>
                        <td>{x.attempts}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                )}
              </Card>
              <Card title={t('growthOs.seo.mc.reports')}>
                {!reports.data?.length ? <Empty>{t('growthOs.seo.none')}</Empty> : <div className="mc-scroll">{reports.data.slice(0, 12).map((r) => <Report key={r.id} r={r} t={t} />)}</div>}
              </Card>
            </div>

            <Card title={t('growthOs.seo.mc.runLog')} right={
              <select aria-label={t('growthOs.seo.mc.runLog')} value={selectedRun?.id ?? ''} onChange={(e) => setLogRun(e.target.value)}>
                {allRuns.slice(0, 60).map((r) => <option key={r.id} value={r.id}>{`${shortWhen(r.started_at)} · ${r.kind} · ${t(`growthOs.seo.runStatus.${r.status}`)} · ${t(`growthOs.seo.trigger.${r.trigger}`)}`}</option>)}
              </select>
            }>
              <div className="mc-log">{selectedRun ? ((selectedRun.log ?? []).join('\n') || selectedRun.summary || '—') : '—'}</div>
            </Card>

            <Card title={t('growthOs.seo.mc.history.title')} right={
              <select aria-label={t('growthOs.seo.mc.history.title')} value={historyType} onChange={(e) => setHistoryType(e.target.value as typeof historyType)}>
                {(['', 'run', 'task', 'draft', 'report'] as const).map((k) => <option key={k || 'all'} value={k}>{t(`growthOs.seo.mc.history.${k || 'all'}`)}</option>)}
              </select>
            }>
              {!history.length ? <Empty>{t('growthOs.seo.none')}</Empty> : (
                <div className="mc-history">
                  {history.map((e, i) => (
                    <div key={`${e.type}-${i}`} className={cn('mc-history-item', e.tone)}>
                      <span aria-hidden>{HISTORY_ICON[e.type]}</span>
                      <div className="mc-h-body"><div className="mc-h-title">{e.title}</div>{e.detail && <div className="mc-h-detail">{e.detail}</div>}</div>
                      <div className="mc-h-time">{shortWhen(e.at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title={t('growthOs.seo.mc.traffic')}>
              {!traffic.length ? <Empty>{t('growthOs.seo.mc.noTraffic')}</Empty> : (
                <>
                  <LineChart label={t('growthOs.seo.mc.traffic')} max={Math.max(1, ...traffic.map(([, v]) => v.all))} series={[
                    { values: traffic.map(([, v]) => v.all), stroke: 'var(--mc-accent-2)', width: 2, opacity: 0.6 },
                    { values: traffic.map(([, v]) => v.organic), stroke: 'var(--mc-low)' },
                  ]} />
                  <div className="mc-legend">
                    <span style={{ color: 'var(--mc-low)' }}>■</span> {t('growthOs.seo.mc.organic', { n: traffic.reduce((a, [, v]) => a + v.organic, 0).toLocaleString('da-DK'), d: traffic.length })}
                    {'  '}<span style={{ color: 'var(--mc-accent-2)' }}>■</span> {t('growthOs.seo.mc.allChannels')}
                  </div>
                </>
              )}
            </Card>

            <div className="mc-grid-2">
              <Card title={t('growthOs.seo.mc.usage')}>
                <div className="mc-table-wrap"><table><tbody>
                  <tr><th>{t('growthOs.seo.mc.rounds')}</th><td>{loops.length.toLocaleString('da-DK')}</td></tr>
                  <tr><th>{t('growthOs.seo.mc.modelCalls')}</th><td>{calls.toLocaleString('da-DK')}</td></tr>
                  <tr><th>{t('growthOs.seo.mc.cost')}</th><td>${cost.toFixed(4)}</td></tr>
                  <tr><th>{t('growthOs.seo.mc.models')}</th><td className="break-all">{models.join(', ') || '—'}</td></tr>
                  <tr><th>{t('growthOs.seo.mc.limit')}</th><td>{t('growthOs.seo.kpi.calls', { n: s.llm_calls_per_day })}</td></tr>
                </tbody></table></div>
              </Card>
              <Settings key={`${s.updated_at}-${s.auto_publish}`} t={t} site={s} isAdmin={isAdmin} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Report({ r, t }: { r: { id: string; kind: string; title: string; body: string; created_at: string }; t: T }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mc-draft">
      <div className="mc-draft-head">
        <div className="min-w-0"><strong>{r.title}</strong> <span className="mc-muted text-xs">{r.kind.toUpperCase()} · {when(r.created_at)}</span></div>
        <button type="button" className="mc-btn small" onClick={() => setOpen(!open)}>{open ? t('growthOs.seo.hide') : t('growthOs.seo.read')}</button>
      </div>
      {open && <pre className="mc-pre mt-3">{r.body}</pre>}
    </div>
  );
}
