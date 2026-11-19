import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { GrowthNotInstalledError } from '@/hooks/api/useGrowthOs';
import {
  type SeoDraft, type SeoRun, type SeoSite, useConfigureSeoSite, useDecideSeoDraft, useRunSeoAutopilot, useSeoChanges, useSeoDrafts,
  useSeoFindings, useSeoReports, useSeoRuns, useSeoSite, useSeoTasks,
} from '@/hooks/api/useSeoAutopilot';
import { cn } from '@/lib/utils';

type T = (k: string, vars?: Record<string, string | number>) => string;
const withVars = (t: (k: string) => string): T => (k, vars) => t(k).replace(/\{(\w+)\}/g, (_, n: string) => String(vars?.[n] ?? ''));
const isRole = (roles: { role: string }[], allowed: string[]) => roles.some((r) => allowed.includes(r.role));
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
const SEV_TONE = { high: 'text-destructive', medium: 'text-warning', low: 'text-muted-foreground' } as const;

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1"><CardDescription>{label}</CardDescription></CardHeader>
      <CardContent className="space-y-1"><div className="text-2xl font-semibold tabular-nums">{value}</div>{note && <p className="text-xs text-muted-foreground">{note}</p>}</CardContent>
    </Card>
  );
}

// ── setup ──────────────────────────────────────────────────────────────────
function SetupCard({ t, site }: { t: T; site: SeoSite | null }) {
  const { roles } = useAuth();
  const isAdmin = isRole(roles, ['owner', 'company_admin']);
  const [url, setUrl] = useState(site?.site_url ?? '');
  const [enabled, setEnabled] = useState(site?.enabled ?? true);
  const [hours, setHours] = useState(String(site?.crawl_every_hours ?? 6));
  const [calls, setCalls] = useState(String(site?.llm_calls_per_day ?? 12));
  const [facts, setFacts] = useState(site?.product_facts ?? '');
  const save = useConfigureSeoSite();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('growthOs.seo.setup.title')}</CardTitle>
        <CardDescription>{t('growthOs.seo.setup.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isAdmin ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate({ siteUrl: url, enabled, crawlEveryHours: Number(hours), llmCallsPerDay: Number(calls), productFacts: facts }); }}>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-1"><Label htmlFor="seo-site">{t('growthOs.seo.setup.site')}</Label><Input id="seo-site" placeholder="https://www.example.dk" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="seo-hours">{t('growthOs.seo.setup.every')}</Label><Input id="seo-hours" type="number" min={1} max={168} value={hours} onChange={(e) => setHours(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="seo-calls">{t('growthOs.seo.setup.calls')}</Label><Input id="seo-calls" type="number" min={0} max={40} value={calls} onChange={(e) => setCalls(e.target.value)} /></div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="seo-facts">{t('growthOs.seo.setup.facts')}</Label>
              <Textarea id="seo-facts" rows={5} maxLength={4000} value={facts} onChange={(e) => setFacts(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t('growthOs.seo.setup.factsHint')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2"><Switch id="seo-on" checked={enabled} onCheckedChange={setEnabled} /><Label htmlFor="seo-on">{t('growthOs.seo.setup.enabled')}</Label></div>
              <Button type="submit" disabled={save.isPending}>{t('growthOs.seo.setup.save')}</Button>
              {save.isSuccess && <span className="text-success">{t('growthOs.seo.setup.saved')}</span>}
            </div>
            {save.error && <p className="text-destructive">{(save.error as Error).message}</p>}
          </form>
        ) : <p className="text-muted-foreground">{t('growthOs.seo.setup.adminOnly')}</p>}
        <p className="text-xs text-muted-foreground">{t('growthOs.seo.setup.freeNote')}</p>
      </CardContent>
    </Card>
  );
}

// ── overview ───────────────────────────────────────────────────────────────
function Overview({ t, runs, site }: { t: T; runs: SeoRun[]; site: SeoSite }) {
  const crawled = runs.filter((r) => r.status === 'ok' && (r.pages ?? 0) > 0);
  const last = crawled[0];
  const prev = crawled[1];
  const findings = useSeoFindings(last?.id);
  const changeRuns = crawled.filter((r) => (r.changes ?? 0) > 0).slice(0, 5).map((r) => r.id);
  const changes = useSeoChanges(changeRuns);
  const series = useMemo(() => [...crawled].reverse().map((r) => ({ at: new Date(r.started_at).toLocaleDateString(), score: r.score })), [crawled]);
  const bySev = (s: string) => (findings.data ?? []).filter((f) => f.severity === s).length;
  const scoreDelta = last && prev && last.score !== null && prev.score !== null ? last.score - prev.score : null;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('growthOs.seo.kpi.score')} value={last?.score === null || !last ? '—' : `${last.score}/100`} note={scoreDelta === null ? t('growthOs.seo.kpi.noPrevious') : t('growthOs.seo.kpi.delta', { d: `${scoreDelta >= 0 ? '+' : ''}${scoreDelta}` })} />
        <Kpi label={t('growthOs.seo.kpi.pages')} value={String(last?.pages ?? '—')} note={last ? t('growthOs.seo.kpi.crawled', { at: when(last.started_at) }) : undefined} />
        <Kpi label={t('growthOs.seo.kpi.findings')} value={String(last?.findings ?? '—')} note={last ? t('growthOs.seo.kpi.bySeverity', { h: bySev('high'), m: bySev('medium'), l: bySev('low') }) : undefined} />
        <Kpi label={t('growthOs.seo.kpi.next')} value={site.enabled ? t('growthOs.seo.kpi.every', { h: site.crawl_every_hours }) : t('growthOs.seo.kpi.paused')} note={t('growthOs.seo.kpi.calls', { n: site.llm_calls_per_day })} />
      </div>
      {series.length > 1 && (
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-base">{t('growthOs.seo.chart')}</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="at" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t('growthOs.seo.findingsTitle')}</CardTitle><CardDescription>{t('growthOs.seo.findingsHint')}</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {!findings.data?.length ? <p className="text-sm text-muted-foreground">{t('growthOs.seo.none')}</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>{t('growthOs.seo.col.severity')}</TableHead><TableHead>{t('growthOs.seo.col.page')}</TableHead><TableHead>{t('growthOs.seo.col.issue')}</TableHead><TableHead>{t('growthOs.seo.col.fix')}</TableHead></TableRow></TableHeader>
              <TableBody>
                {(findings.data ?? []).slice().sort((a, b) => ['high', 'medium', 'low'].indexOf(a.severity) - ['high', 'medium', 'low'].indexOf(b.severity)).slice(0, 60).map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className={cn('font-medium', SEV_TONE[f.severity])}>{t(`growthOs.seo.sev.${f.severity}`)}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={f.url}>{f.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</TableCell>
                    <TableCell>{f.issue}</TableCell>
                    <TableCell className="text-muted-foreground">{f.fix}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{t('growthOs.seo.changesTitle')}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {!changes.data?.length ? <p className="text-sm text-muted-foreground">{t('growthOs.seo.noChanges')}</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>{t('growthOs.seo.col.page')}</TableHead><TableHead>{t('growthOs.seo.col.field')}</TableHead><TableHead>{t('growthOs.seo.col.before')}</TableHead><TableHead>{t('growthOs.seo.col.after')}</TableHead></TableRow></TableHeader>
              <TableBody>
                {changes.data.slice(0, 50).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-[200px] truncate" title={c.url}>{c.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</TableCell>
                    <TableCell>{c.field}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground" title={c.before ?? ''}>{c.before || '—'}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={c.after ?? ''}>{c.after || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── drafts (human approval) ────────────────────────────────────────────────
function DraftCard({ d, t, canDecide }: { d: SeoDraft; t: T; canDecide: boolean }) {
  const [open, setOpen] = useState(false);
  const decide = useDecideSeoDraft();
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t(`growthOs.seo.kind.${d.kind}`)}</Badge>
          <Badge variant={d.review_status === 'failed' ? 'destructive' : 'secondary'}>{t(`growthOs.seo.review.${d.review_status}`)}{d.review_score !== null ? ` · ${d.review_score}/10` : ''}</Badge>
          {d.decision !== 'pending' && <Badge>{t(`growthOs.seo.decision.${d.decision}`)}</Badge>}
          <span className="text-xs text-muted-foreground">{when(d.created_at)}</span>
        </div>
        <CardTitle className="text-base">{d.title}</CardTitle>
        {d.slug && <CardDescription>{d.slug}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {d.summary && <p>{d.summary}</p>}
        {d.review_notes && <p className="text-muted-foreground">{t('growthOs.seo.reviewNotes')}: {d.review_notes}</p>}
        {open && (
          <div className="space-y-1 rounded-md border border-border bg-muted/40 p-3">
            {d.meta_description && <p><span className="font-medium">Meta:</span> {d.meta_description}</p>}
            {d.h1 && <p><span className="font-medium">H1:</span> {d.h1}</p>}
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans text-sm">{d.body}</pre>
            <p className="text-xs text-muted-foreground">{t('growthOs.seo.models', { w: d.worker_model ?? '—', r: d.review_model ?? '—' })}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>{open ? t('growthOs.seo.hide') : t('growthOs.seo.read')}</Button>
          {canDecide && d.decision === 'pending' && d.review_status !== 'pending' && (
            <>
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: d.id, approve: true })}>{t('growthOs.seo.approve')}</Button>
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: d.id, approve: false })}>{t('growthOs.seo.reject')}</Button>
            </>
          )}
        </div>
        {decide.error && <p className="text-destructive">{(decide.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

function Drafts({ t }: { t: T }) {
  const { roles } = useAuth();
  const drafts = useSeoDrafts();
  const [show, setShow] = useState<'waiting' | 'all'>('waiting');
  const list = (drafts.data ?? []).filter((d) => show === 'all' || (d.decision === 'pending' && d.review_status !== 'failed'));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('growthOs.seo.draftsHint')}</p>
      <div className="flex gap-2">
        <Button size="sm" variant={show === 'waiting' ? 'default' : 'outline'} onClick={() => setShow('waiting')}>{t('growthOs.seo.waiting')}</Button>
        <Button size="sm" variant={show === 'all' ? 'default' : 'outline'} onClick={() => setShow('all')}>{t('growthOs.seo.all')}</Button>
      </div>
      {!list.length ? <p className="text-sm text-muted-foreground">{t('growthOs.seo.none')}</p> : list.map((d) => <DraftCard key={d.id} d={d} t={t} canDecide={isRole(roles, ['owner', 'company_admin'])} />)}
    </div>
  );
}

function Tasks({ t }: { t: T }) {
  const tasks = useSeoTasks();
  return (
    <Card><CardContent className="overflow-x-auto pt-4">
      {!tasks.data?.length ? <p className="text-sm text-muted-foreground">{t('growthOs.seo.none')}</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>{t('growthOs.seo.col.task')}</TableHead><TableHead>{t('growthOs.seo.col.type')}</TableHead><TableHead>{t('growthOs.seo.col.status')}</TableHead><TableHead>{t('growthOs.seo.col.created')}</TableHead></TableRow></TableHeader>
          <TableBody>
            {tasks.data.map((x) => (
              <TableRow key={x.id}>
                <TableCell><div className="font-medium">{x.title}</div><div className="text-xs text-muted-foreground">{x.target ?? ''}{x.error ? ` · ${x.error}` : ''}</div></TableCell>
                <TableCell>{t(`growthOs.seo.type.${x.type}`)}</TableCell>
                <TableCell>{t(`growthOs.seo.taskStatus.${x.status}`)}{x.attempts ? ` (${x.attempts})` : ''}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{when(x.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent></Card>
  );
}

function Runs({ t, runs }: { t: T; runs: SeoRun[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card><CardContent className="space-y-2 pt-4 text-sm">
      {!runs.length ? <p className="text-muted-foreground">{t('growthOs.seo.none')}</p> : runs.map((r) => (
        <div key={r.id} className="rounded-md border border-border p-2">
          <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
            <Badge variant={r.status === 'error' ? 'destructive' : 'outline'}>{t(`growthOs.seo.runStatus.${r.status}`)}</Badge>
            <span className="text-muted-foreground">{when(r.started_at)} · {t(`growthOs.seo.trigger.${r.trigger}`)}</span>
            <span className="min-w-0 flex-1 truncate">{r.error ?? r.summary ?? ''}</span>
          </button>
          {open === r.id && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{(r.log ?? []).join('\n') || '—'}</pre>}
        </div>
      ))}
    </CardContent></Card>
  );
}

function History({ t }: { t: T }) {
  const reports = useSeoReports();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{t('growthOs.seo.historyHint')}</p>
      {!reports.data?.length ? <p className="text-sm text-muted-foreground">{t('growthOs.seo.none')}</p> : reports.data.map((r) => (
        <Card key={r.id}><CardContent className="space-y-2 pt-4 text-sm">
          <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
            <Badge variant="outline">{r.kind.toUpperCase()}</Badge><span className="font-medium">{r.title}</span><span className="text-muted-foreground">{when(r.created_at)}</span>
          </button>
          {open === r.id && <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap font-sans">{r.body}</pre>}
        </CardContent></Card>
      ))}
    </div>
  );
}

export function SeoAutopilot({ t: rawT }: { t: (k: string) => string }) {
  const t = useMemo(() => withVars(rawT), [rawT]);
  const { roles } = useAuth();
  const site = useSeoSite();
  const runs = useSeoRuns();
  const run = useRunSeoAutopilot();
  if (site.error instanceof GrowthNotInstalledError || runs.error instanceof GrowthNotInstalledError) {
    return <Card><CardContent className="py-6 text-sm text-muted-foreground">{t('growthOs.seo.notInstalled')}</CardContent></Card>;
  }
  if (site.isLoading) return <p className="text-sm text-muted-foreground">…</p>;
  const running = (runs.data ?? []).some((r) => r.status === 'running');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('growthOs.seo.title')}</h2>
          <p className="text-sm text-muted-foreground">{site.data ? site.data.site_url : t('growthOs.seo.subtitle')}</p>
        </div>
        {site.data && isRole(roles, ['owner', 'company_admin', 'manager']) && (
          <Button disabled={run.isPending || running} onClick={() => run.mutate('SEO autopilot round started from the Growth OS page')}>
            {running ? t('growthOs.seo.running') : t('growthOs.seo.runNow')}
          </Button>
        )}
      </div>
      {run.isSuccess && <p className="text-sm text-success">{t('growthOs.seo.queued')}</p>}
      {run.error && <p className="text-sm text-destructive">{(run.error as Error).message}</p>}
      <Tabs defaultValue={site.data ? 'overview' : 'setup'}>
        <TabsList className="flex-wrap">
          {site.data && ['overview', 'drafts', 'tasks', 'runs', 'history'].map((k) => <TabsTrigger key={k} value={k}>{t(`growthOs.seo.tab.${k}`)}</TabsTrigger>)}
          <TabsTrigger value="setup">{t('growthOs.seo.tab.setup')}</TabsTrigger>
        </TabsList>
        {site.data && (
          <>
            <TabsContent value="overview" className="mt-4"><Overview t={t} runs={runs.data ?? []} site={site.data} /></TabsContent>
            <TabsContent value="drafts" className="mt-4"><Drafts t={t} /></TabsContent>
            <TabsContent value="tasks" className="mt-4"><Tasks t={t} /></TabsContent>
            <TabsContent value="runs" className="mt-4"><Runs t={t} runs={runs.data ?? []} /></TabsContent>
            <TabsContent value="history" className="mt-4"><History t={t} /></TabsContent>
          </>
        )}
        <TabsContent value="setup" className="mt-4"><SetupCard key={site.data?.updated_at ?? 'new'} t={t} site={site.data ?? null} /></TabsContent>
      </Tabs>
    </div>
  );
}
