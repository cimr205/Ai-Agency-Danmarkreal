import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { GrowthNotInstalledError } from '@/hooks/api/useGrowthOs';
import {
  type AnalyticsConnection, type SeoRecommendation, useAnalyticsConnections, useBusinessImpact, useDecideRecommendation, useGa4Daily,
  useGa4Landing, useGscDaily, useGscQueryPage, useMarkImplemented, useRequestAnalyticsConnection, useRunOpportunities,
  useSeoRecommendations, useSetConnectionStatus,
} from '@/hooks/api/useGrowthAnalytics';
import { change, channels, comparePeriods, dailySeries, ga4Totals, gscTotals, topBy, topLanding } from '@/growth-os/analytics-metrics';
import { cn } from '@/lib/utils';

type T = (k: string, vars?: Record<string, string | number>) => string;
/** The app's t() takes a key only; fill {placeholders} here. */
const withVars = (t: (k: string) => string): T => (k, vars) => t(k).replace(/\{(\w+)\}/g, (_, n: string) => String(vars?.[n] ?? ''));
const canApproveRoles = (roles: { role: string }[]) => roles.some((r) => r.role === 'owner' || r.role === 'company_admin');
const DAYS = 28;
const fmt = (n: number | null | undefined, digits = 0) => (n === null || n === undefined ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: digits }));
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${(n * 100).toFixed(1)}%`);

function Delta({ value, t }: { value: number | null; t: T }) {
  if (value === null) return <span className="text-xs text-muted-foreground">{t('growthOs.analytics.noBaseline')}</span>;
  return <span className={cn('text-xs tabular-nums', value >= 0 ? 'text-success' : 'text-destructive')}>{value >= 0 ? '+' : ''}{(value * 100).toFixed(1)}% {t('growthOs.analytics.vsPrevious')}</span>;
}

function Kpi({ label, value, delta, note, t }: { label: string; value: string; delta?: number | null; note?: string; t: T }) {
  return (
    <Card>
      <CardHeader className="pb-1"><CardDescription>{label}</CardDescription></CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {delta !== undefined && <Delta value={delta} t={t} />}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Card><CardContent className="py-6 space-y-1"><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{body}</p></CardContent></Card>
  );
}

// ── connection ─────────────────────────────────────────────────────────────
function ConnectionCard({ t, own }: { t: T; own: AnalyticsConnection | undefined }) {
  const { roles } = useAuth();
  const isAdmin = canApproveRoles(roles);
  const [ga4, setGa4] = useState(own?.ga4_property_id ?? '');
  const [gsc, setGsc] = useState(own?.gsc_site_url ?? '');
  const req = useRequestAnalyticsConnection();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('growthOs.analytics.connection.title')}</CardTitle>
        <CardDescription>{t('growthOs.analytics.connection.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {own && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t(`growthOs.analytics.connection.status.${own.status}`)}</Badge>
            {own.last_sync_at && <span className="text-muted-foreground">{t('growthOs.analytics.connection.lastSync', { at: new Date(own.last_sync_at).toLocaleString() })}</span>}
            {own.last_error && <span className="text-destructive">{own.last_error}</span>}
          </div>
        )}
        {isAdmin ? (
          <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); req.mutate({ ga4PropertyId: ga4, gscSiteUrl: gsc }); }}>
            <div className="space-y-1"><Label htmlFor="ga4-prop">{t('growthOs.analytics.connection.ga4Label')}</Label><Input id="ga4-prop" inputMode="numeric" placeholder="533214056" value={ga4} onChange={(e) => setGa4(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="gsc-site">{t('growthOs.analytics.connection.gscLabel')}</Label><Input id="gsc-site" placeholder="sc-domain:example.dk" value={gsc} onChange={(e) => setGsc(e.target.value)} /></div>
            <Button type="submit" disabled={req.isPending}>{t('growthOs.analytics.connection.request')}</Button>
          </form>
        ) : <p className="text-muted-foreground">{t('growthOs.analytics.connection.adminOnly')}</p>}
        {req.error && <p className="text-destructive">{(req.error as Error).message}</p>}
        <p className="text-xs text-muted-foreground">{t('growthOs.analytics.connection.howTo')}</p>
      </CardContent>
    </Card>
  );
}

function PendingApprovals({ t, rows }: { t: T; rows: AnalyticsConnection[] }) {
  const set = useSetConnectionStatus();
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{t('growthOs.analytics.connection.pendingTitle')}</CardTitle><CardDescription>{t('growthOs.analytics.connection.pendingHint')}</CardDescription></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.map((c) => (
          <div key={c.company_id} className="flex flex-wrap items-center gap-2">
            <code className="text-xs">{c.company_id.slice(0, 8)}</code><span>{c.ga4_property_id ?? '—'}</span><span>{c.gsc_site_url ?? '—'}</span>
            <Button size="sm" variant="outline" disabled={set.isPending} onClick={() => set.mutate({ companyId: c.company_id, status: 'active' })}>{t('growthOs.analytics.connection.activate')}</Button>
          </div>
        ))}
        {set.error && <p className="text-destructive">{(set.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

// ── recommendations ────────────────────────────────────────────────────────
function RecommendationCard({ r, t }: { r: SeoRecommendation; t: T }) {
  const decide = useDecideRecommendation();
  const done = useMarkImplemented();
  const { roles } = useAuth();
  const isAdmin = canApproveRoles(roles);
  const ev = r.evidence as Record<string, string | number | null>;
  const outcome = r.outcome as { metric?: string; before?: Record<string, number>; after?: Record<string, number>; change_pct?: number | null } | null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t(`growthOs.analytics.recs.priority${r.priority}`)}</Badge>
          <Badge variant="outline">{t(`growthOs.analytics.recs.kind.${r.kind}`)}</Badge>
          <Badge variant="outline">{t(`growthOs.analytics.recs.status.${r.status}`)}</Badge>
        </div>
        <CardTitle className="text-sm break-all">{r.target}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p><span className="font-medium">{t('growthOs.analytics.recs.problem')}:</span> {r.problem}</p>
        <p className="text-muted-foreground"><span className="font-medium text-foreground">{t('growthOs.analytics.recs.basis')}:</span> {t(`growthOs.analytics.recs.source.${ev.source}`)}, {String(ev.period ?? '')}</p>
        <p><span className="font-medium">{t('growthOs.analytics.recs.action')}:</span> {r.action}</p>
        <p className="text-muted-foreground"><span className="font-medium text-foreground">{t('growthOs.analytics.recs.effect')}:</span> {r.expected_effect}</p>
        {outcome && (
          <p className="rounded-md border p-2"><span className="font-medium">{t('growthOs.analytics.recs.outcome')}:</span> {outcome.metric} {fmt(outcome.before?.[outcome.metric ?? ''])} → {fmt(outcome.after?.[outcome.metric ?? ''])} ({pct(outcome.change_pct)}). {t('growthOs.analytics.recs.correlation')}</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {r.status === 'proposed' && isAdmin && (
            <>
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: true })}>{t('growthOs.analytics.recs.approve')}</Button>
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: false })}>{t('growthOs.analytics.recs.reject')}</Button>
            </>
          )}
          {r.status === 'approved' && (
            <Button size="sm" variant="outline" disabled={done.isPending} onClick={() => done.mutate({ id: r.id, on: new Date().toISOString().slice(0, 10) })}>{t('growthOs.analytics.recs.markDone')}</Button>
          )}
        </div>
        {(decide.error || done.error) && <p className="text-destructive">{((decide.error ?? done.error) as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

// ── page ───────────────────────────────────────────────────────────────────
export function AnalyticsDashboard({ t: baseT }: { t: (k: string) => string }) {
  const t = withVars(baseT);
  const { user, isSystemAdmin } = useAuth();
  const conns = useAnalyticsConnections();
  const own = conns.data?.find((c) => c.company_id === user?.company_id);
  const lastDay = own?.ga4_synced_through ?? own?.gsc_synced_through ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const p = useMemo(() => comparePeriods(lastDay, DAYS), [lastDay]);
  const active = own?.status === 'active';
  const ga4 = useGa4Daily(p.previous.from, p.current.to, active && !!own?.ga4_property_id);
  const landing = useGa4Landing(p.current.from, p.current.to, active && !!own?.ga4_property_id);
  const gsc = useGscDaily(p.previous.from, p.current.to, active && !!own?.gsc_site_url);
  const gscLastDay = own?.gsc_synced_through ?? lastDay;
  const pg = useMemo(() => comparePeriods(gscLastDay, DAYS), [gscLastDay]);
  const qp = useGscQueryPage(pg.current.from, pg.current.to, active && !!own?.gsc_site_url);
  const recs = useSeoRecommendations();
  const impact = useBusinessImpact(p.current.from, p.current.to);
  const run = useRunOpportunities();

  if (conns.error instanceof GrowthNotInstalledError) return <Notice title={t('growthOs.notInstalled')} body={t('growthOs.analytics.notInstalledHint')} />;

  const cur = ga4Totals(ga4.data ?? [], p.current), prev = ga4Totals(ga4.data ?? [], p.previous);
  const gCur = gscTotals(gsc.data ?? [], pg.current), gPrev = gscTotals(gsc.data ?? [], pg.previous);
  const hasGa4 = (ga4.data?.length ?? 0) > 0, hasGsc = (gsc.data?.length ?? 0) > 0;
  const series = dailySeries(ga4.data ?? [], gsc.data ?? [], p.current);
  const pendingForAdmin = isSystemAdmin ? (conns.data ?? []).filter((c) => c.status === 'pending') : [];
  const notConnected = !own || own.status !== 'active';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t('growthOs.analytics.title')}</h2>
          <p className="text-sm text-muted-foreground">{active ? t('growthOs.analytics.period', { from: p.current.from, to: p.current.to, prevFrom: p.previous.from, prevTo: p.previous.to }) : t('growthOs.analytics.subtitle')}</p>
        </div>
        {active && <Button variant="outline" size="sm" disabled={run.isPending} onClick={() => run.mutate(t('growthOs.analytics.recs.objective'))}>{run.isSuccess ? t('growthOs.analytics.recs.queued') : t('growthOs.analytics.recs.run')}</Button>}
      </div>
      {run.error && <p className="text-sm text-destructive">{(run.error as Error).message}</p>}

      <PendingApprovals t={t} rows={pendingForAdmin} />
      {(notConnected || own?.last_error) && <ConnectionCard t={t} own={own} />}

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">{t('growthOs.analytics.tabs.overview')}</TabsTrigger>
          <TabsTrigger value="seo">{t('growthOs.analytics.tabs.seo')}</TabsTrigger>
          <TabsTrigger value="recs">{t('growthOs.analytics.tabs.recs')}</TabsTrigger>
          <TabsTrigger value="impact">{t('growthOs.analytics.tabs.impact')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {!active || !own?.ga4_property_id ? <Notice title={t('growthOs.analytics.notConnected')} body={t('growthOs.analytics.notConnectedGa4')} />
            : !hasGa4 ? <Notice title={t('growthOs.analytics.noData')} body={t('growthOs.analytics.noDataBody')} /> : (
            <>
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <Kpi t={t} label={t('growthOs.analytics.kpi.organicSessions')} value={fmt(cur.organicSessions)} delta={change(cur.organicSessions, prev.organicSessions)} />
                <Kpi t={t} label={t('growthOs.analytics.kpi.sessions')} value={fmt(cur.sessions)} delta={change(cur.sessions, prev.sessions)} />
                <Kpi t={t} label={t('growthOs.analytics.kpi.keyEvents')} value={fmt(cur.keyEvents, 1)} delta={change(cur.keyEvents, prev.keyEvents)} note={t('growthOs.analytics.kpi.organicKeyEvents', { n: fmt(cur.organicKeyEvents, 1) })} />
                <Kpi t={t} label={t('growthOs.analytics.kpi.engagement')} value={pct(cur.engagementRate)} note={t('growthOs.analytics.kpi.avgDailyUsers', { n: fmt(cur.activeUsersDailySum / DAYS, 1) })} />
              </div>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">{t('growthOs.analytics.chartTitle')}</CardTitle><CardDescription>{t('growthOs.analytics.chartNote')}</CardDescription></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                      <Line type="monotone" dataKey="organicSessions" name={t('growthOs.analytics.kpi.organicSessions')} stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="sessions" name={t('growthOs.analytics.kpi.sessions')} stroke="hsl(var(--muted-foreground))" dot={false} />
                      {hasGsc && <Line type="monotone" dataKey="clicks" name={t('growthOs.analytics.kpi.gscClicks')} stroke="hsl(var(--success))" dot={false} strokeDasharray="4 3" />}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">{t('growthOs.analytics.channels')}</CardTitle></CardHeader>
                <CardContent>
                  <Table><TableHeader><TableRow><TableHead>{t('growthOs.analytics.col.channel')}</TableHead><TableHead className="text-right">{t('growthOs.analytics.col.sessions')}</TableHead></TableRow></TableHeader>
                    <TableBody>{channels(ga4.data ?? [], p.current).map((c) => <TableRow key={c.channel}><TableCell>{c.channel}</TableCell><TableCell className="text-right tabular-nums">{fmt(c.sessions)}</TableCell></TableRow>)}</TableBody></Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">{t('growthOs.analytics.landingPages')}</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table><TableHeader><TableRow><TableHead>{t('growthOs.analytics.col.page')}</TableHead><TableHead className="text-right">{t('growthOs.analytics.col.organic')}</TableHead><TableHead className="text-right">{t('growthOs.analytics.col.sessions')}</TableHead><TableHead className="text-right">{t('growthOs.analytics.col.keyEvents')}</TableHead></TableRow></TableHeader>
                    <TableBody>{topLanding(landing.data ?? [], p.current).map((l) => <TableRow key={l.page}><TableCell className="max-w-[18rem] truncate">{l.page}</TableCell><TableCell className="text-right tabular-nums">{fmt(l.organicSessions)}</TableCell><TableCell className="text-right tabular-nums">{fmt(l.sessions)}</TableCell><TableCell className="text-right tabular-nums">{fmt(l.keyEvents, 1)}</TableCell></TableRow>)}</TableBody></Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="seo" className="space-y-4">
          {!active || !own?.gsc_site_url ? <Notice title={t('growthOs.analytics.notConnected')} body={t('growthOs.analytics.notConnectedGsc')} />
            : !hasGsc ? <Notice title={t('growthOs.analytics.noData')} body={t('growthOs.analytics.noDataBody')} /> : (
            <>
              <p className="text-xs text-muted-foreground">{t('growthOs.analytics.gscNote', { from: pg.current.from, to: pg.current.to })}</p>
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <Kpi t={t} label={t('growthOs.analytics.kpi.gscClicks')} value={fmt(gCur.clicks)} delta={change(gCur.clicks, gPrev.clicks)} />
                <Kpi t={t} label={t('growthOs.analytics.kpi.impressions')} value={fmt(gCur.impressions)} delta={change(gCur.impressions, gPrev.impressions)} />
                <Kpi t={t} label={t('growthOs.analytics.kpi.ctr')} value={pct(gCur.ctr)} />
                <Kpi t={t} label={t('growthOs.analytics.kpi.position')} value={fmt(gCur.position, 1)} />
              </div>
              {(['query', 'page'] as const).map((k) => (
                <Card key={k}>
                  <CardHeader className="pb-2"><CardTitle className="text-base">{t(k === 'query' ? 'growthOs.analytics.topQueries' : 'growthOs.analytics.topPages')}</CardTitle><CardDescription>{t('growthOs.analytics.anonymisedNote')}</CardDescription></CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table><TableHeader><TableRow><TableHead>{t(k === 'query' ? 'growthOs.analytics.col.query' : 'growthOs.analytics.col.page')}</TableHead><TableHead className="text-right">{t('growthOs.analytics.kpi.gscClicks')}</TableHead><TableHead className="text-right">{t('growthOs.analytics.kpi.impressions')}</TableHead><TableHead className="text-right">{t('growthOs.analytics.kpi.ctr')}</TableHead><TableHead className="text-right">{t('growthOs.analytics.kpi.position')}</TableHead></TableRow></TableHeader>
                      <TableBody>{topBy(qp.data ?? [], pg.current, k).map((r) => <TableRow key={r.key}><TableCell className="max-w-[18rem] truncate">{r.key}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.clicks)}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.impressions)}</TableCell><TableCell className="text-right tabular-nums">{pct(r.ctr)}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.position, 1)}</TableCell></TableRow>)}</TableBody></Table>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </TabsContent>

        <TabsContent value="recs" className="space-y-3">
          <p className="text-xs text-muted-foreground">{t('growthOs.analytics.recs.hint')}</p>
          {(recs.data ?? []).length === 0 ? <Notice title={t('growthOs.analytics.recs.none')} body={active ? t('growthOs.analytics.recs.noneActive') : t('growthOs.analytics.notConnectedGa4')} />
            : (recs.data ?? []).map((r) => <RecommendationCard key={r.id} r={r} t={t} />)}
        </TabsContent>

        <TabsContent value="impact" className="space-y-4">
          {impact.data ? (
            <>
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <Kpi t={t} label={t('growthOs.analytics.impact.organicLeads')} value={fmt(impact.data.leads_organic)} note={t('growthOs.analytics.impact.ofLeads', { n: impact.data.leads_total })} />
                <Kpi t={t} label={t('growthOs.analytics.impact.conversion')} value={impact.data.leads_organic ? pct(impact.data.leads_organic_converted / impact.data.leads_organic) : '—'} note={t('growthOs.analytics.impact.converted', { n: impact.data.leads_organic_converted })} />
                <Kpi t={t} label={t('growthOs.analytics.impact.payingOrganic')} value={fmt(impact.data.paying_customers_organic)} note={t('growthOs.analytics.impact.ofPaying', { n: impact.data.paying_customers_total })} />
                <Kpi t={t} label={t('growthOs.analytics.impact.revenue')} value={impact.data.leads_organic ? fmt(impact.data.revenue_organic) : '—'} note={t('growthOs.analytics.impact.revenueNote')} />
              </div>
              {impact.data.leads_without_source > 0 && (
                <Notice title={t('growthOs.analytics.impact.untrackedTitle', { n: impact.data.leads_without_source, total: impact.data.leads_total })} body={t('growthOs.analytics.impact.untrackedBody')} />
              )}
            </>
          ) : <Notice title={t('growthOs.analytics.noData')} body={t('growthOs.analytics.impact.none')} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
