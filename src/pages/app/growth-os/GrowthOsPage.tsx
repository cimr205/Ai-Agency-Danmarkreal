import { AnalyticsDashboard } from './AnalyticsDashboard';
import { useMemo, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity, AlertTriangle, BookOpen, Building2, CheckCircle2, ClipboardCheck, Crown, FlaskConical, Gauge,
  GraduationCap, LayoutDashboard, LineChart, ScrollText, Settings2, ShieldCheck, Users, Wallet, XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import {
  AGENT_PROFILES, DEPARTMENTS, EXTERNAL_SKILLS, SKILLS, SPECIALISTS, type AgentProfile,
} from '@/growth-os/registry';
import {
  GrowthNotInstalledError, useDecideApproval, useGrowthActivity, useGrowthApprovals, useGrowthAudit, useGrowthBudget,
  useGrowthLearning, useGrowthReports, useGrowthTasks, useGrowthUsage, useRunSeoAudit, useSetGrowthBudget,
} from '@/hooks/api/useGrowthOs';

type T = (k: string) => string;

const SECTIONS = [
  { path: '', key: 'commandCenter', icon: LayoutDashboard },
  { path: 'ceo', key: 'globalCeo', icon: Crown },
  { path: 'departments', key: 'departments', icon: Building2 },
  { path: 'agents', key: 'allAgents', icon: Users },
  { path: 'activity', key: 'liveActivity', icon: Activity },
  { path: 'skills', key: 'skillLibrary', icon: BookOpen },
  { path: 'learning', key: 'learningCenter', icon: GraduationCap },
  { path: 'experiments', key: 'experiments', icon: FlaskConical },
  { path: 'analytics', key: 'analytics', icon: LineChart },
  { path: 'approvals', key: 'approvals', icon: ClipboardCheck },
  { path: 'budget', key: 'budgetUsage', icon: Wallet },
  { path: 'audit', key: 'auditLog', icon: ScrollText },
  { path: 'settings', key: 'settings', icon: Settings2 },
] as const;

const usd = (v: number | null | undefined, digits = 4) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(digits)}`);
const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true });

function StatusPill({ status, t }: { status: string; t: T }) {
  const tone =
    ['ok', 'completed', 'verified', 'approved', 'operational', 'active', 'accept', 'consumed'].includes(status) ? 'border-success/40 text-success'
    : ['failed', 'discrepancy', 'rejected', 'dead', 'error', 'invalid_output', 'reject'].includes(status) ? 'border-destructive/40 text-destructive'
    : ['blocked', 'inconclusive', 'pending', 'needs_human', 'refused_budget', 'rerun', 'draft'].includes(status) ? 'border-warning/50 text-warning'
    : 'border-border text-muted-foreground';
  return <Badge variant="outline" className={cn('font-normal', tone)}>{t(`growthOs.status.${status}`)}</Badge>;
}

/** Renders a query's loading / not-installed / error state, or its children. */
function QueryState({ q, t, children, empty }: { q: { isLoading: boolean; error: unknown; data?: unknown }; t: T; children: ReactNode; empty?: boolean }) {
  if (q.isLoading) return <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>;
  if (q.error instanceof GrowthNotInstalledError) {
    return <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />{t('growthOs.notInstalled')}</p>;
  }
  if (q.error) return <p className="text-sm text-destructive">{String((q.error as Error).message)}</p>;
  if (empty) return <p className="py-6 text-center text-sm text-muted-foreground">{t('growthOs.empty')}</p>;
  return <>{children}</>;
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function NotBuilt({ t, phase }: { t: T; phase: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-6 text-sm">
        <Gauge className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <p className="font-medium">{t('growthOs.notBuiltTitle')}</p>
          <p className="text-muted-foreground">{t('growthOs.notBuiltBody').replace('{phase}', phase)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── sections ──────────────────────────────────────────────────────────────

function RunSeoCard({ t }: { t: T }) {
  const [url, setUrl] = useState('');
  const run = useRunSeoAudit();
  const result = run.data;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('growthOs.runSeo.title')}</CardTitle>
        <CardDescription>{t('growthOs.runSeo.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (url) run.mutate({ url, objective: t('growthOs.runSeo.objective') }); }}>
          <Label htmlFor="seo-url" className="sr-only">URL</Label>
          <Input id="seo-url" type="url" required placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="submit" disabled={run.isPending}>{run.isPending ? t('growthOs.runSeo.running') : t('growthOs.runSeo.run')}</Button>
        </form>
        {run.error && <p className="text-sm text-destructive">{String((run.error as Error).message)}</p>}
        {result && (
          <div className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {result.status && <StatusPill status={result.status} t={t} />}
              {result.verification && <StatusPill status={result.verification.status} t={t} />}
              {result.report?.after_metrics?.onpage_score !== undefined && <span className="tabular-nums">{t('growthOs.score')}: {result.report.after_metrics.onpage_score}</span>}
            </div>
            {result.report?.recommendation && <p className="mt-2 text-muted-foreground">{result.report.recommendation}</p>}
            {result.error && <p className="mt-2 text-destructive">{result.error === 'worker_timeout' ? t('growthOs.runSeo.workerTimeout') : result.error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CommandCenter({ t }: { t: T }) {
  const tasks = useGrowthTasks();
  const usage = useGrowthUsage(30);
  const approvals = useGrowthApprovals();
  const reports = useGrowthReports();
  const learning = useGrowthLearning();
  const budget = useGrowthBudget();
  const list = tasks.data ?? [];
  const active = list.filter((x) => x.status === 'leased').length;
  const queued = list.filter((x) => x.status === 'queued').length;
  const failed = list.filter((x) => ['failed', 'dead', 'blocked'].includes(x.status)).length;
  const pending = (approvals.data ?? []).filter((a) => a.status === 'pending').length;
  const spent30 = (usage.data ?? []).reduce((s, u) => s + Number(u.actual_usd ?? 0), 0);
  const unknownCost = (usage.data ?? []).some((u) => u.status === 'ok' && u.actual_usd === null);
  const verified = (reports.data ?? []).filter((r) => r.kind === 'verification' && (r.body as { status?: string }).status === 'verified');
  const operational = AGENT_PROFILES.filter((p) => p.kind === 'specialist' && p.status === 'operational').length;
  const proposals = (learning.data ?? []).filter((l) => l.outcome === 'improvement_proposed');

  return (
    <div className="space-y-6">
      <QueryState q={tasks} t={t}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('growthOs.cc.active')} value={active} hint={`${queued} ${t('growthOs.cc.queued')}`} />
          <Stat label={t('growthOs.cc.failed')} value={failed} />
          <Stat label={t('growthOs.cc.pendingApprovals')} value={pending} />
          <Stat label={t('growthOs.cc.spend30')} value={usd(spent30)} hint={unknownCost ? t('growthOs.cc.costUnknownPart') : budget.data ? `${t('growthOs.cc.today')} ${usd(budget.data.spentToday)} / ${usd(budget.data.budget.daily_usd_limit, 2)}` : undefined} />
        </div>
      </QueryState>
      <div className="grid gap-6 lg:grid-cols-2">
        <RunSeoCard t={t} />
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{t('growthOs.cc.health')}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label={t('growthOs.cc.operationalAgents')} value={`${operational} / ${SPECIALISTS.length}`} />
            <Row label={t('growthOs.cc.activeSkills')} value={`${SKILLS.filter((s) => s.status === 'active').length} / ${SKILLS.length}`} />
            <Row label={t('growthOs.cc.verifiedResults')} value={String(verified.length)} />
            <Row label={t('growthOs.cc.learningProposals')} value={String(proposals.length)} />
            <Row label={t('growthOs.cc.kpis')} value={t('growthOs.cc.kpisMissing')} muted />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{t('growthOs.cc.latestVerified')}</CardTitle></CardHeader>
        <CardContent>
          <QueryState q={reports} t={t} empty={verified.length === 0}>
            <ul className="divide-y text-sm">
              {verified.slice(0, 5).map((r) => {
                const agentReport = (reports.data ?? []).find((x) => x.task_id === r.task_id && x.kind === 'agent')?.body as { objective?: string; after_metrics?: { onpage_score?: number }; recommendation?: string } | undefined;
                return (
                  <li key={r.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0 truncate">{agentReport?.recommendation ?? r.task_id}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t('growthOs.score')} {agentReport?.after_metrics?.onpage_score ?? '—'} · {ago(r.created_at)}</span>
                  </li>
                );
              })}
            </ul>
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className={cn('text-right tabular-nums', muted && 'text-muted-foreground')}>{value}</span></div>;
}

function GlobalCeo({ t }: { t: T }) {
  const reports = useGrowthReports();
  const ceo = (reports.data ?? []).filter((r) => r.kind === 'ceo');
  const profile = AGENT_PROFILES.find((p) => p.kind === 'global_ceo')!;
  return (
    <div className="space-y-6">
      <Card><CardContent className="p-4 text-sm text-muted-foreground">{profile.responsibility}</CardContent></Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{t('growthOs.ceo.escalations')}</CardTitle></CardHeader>
        <CardContent>
          <QueryState q={reports} t={t} empty={ceo.length === 0}>
            <Table>
              <TableHeader><TableRow><TableHead>{t('growthOs.col.ceo')}</TableHead><TableHead>{t('growthOs.col.decision')}</TableHead><TableHead>{t('growthOs.col.priority')}</TableHead><TableHead className="hidden md:table-cell">{t('growthOs.col.reasons')}</TableHead><TableHead>{t('growthOs.col.when')}</TableHead></TableRow></TableHeader>
              <TableBody>
                {ceo.map((r) => {
                  const b = r.body as { ceoId?: string; decision?: string; priority?: string; reasons?: string[] };
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{b.ceoId}</TableCell>
                      <TableCell><StatusPill status={b.decision ?? 'unknown'} t={t} /></TableCell>
                      <TableCell>{b.priority}</TableCell>
                      <TableCell className="hidden max-w-md truncate md:table-cell">{(b.reasons ?? []).join(' · ')}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{ago(r.created_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}

function Departments({ t }: { t: T }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {DEPARTMENTS.map((d) => {
        const sp = SPECIALISTS.filter((s) => s.department === d.id);
        const ops = sp.filter((s) => s.status === 'operational').length;
        return (
          <Card key={d.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2"><CardTitle className="text-base">{d.name}</CardTitle><StatusPill status={ops ? 'operational' : 'registered'} t={t} /></div>
              <CardDescription>{d.mandate}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="text-muted-foreground">{t('growthOs.dept.specialists')}: {sp.length} · {t('growthOs.dept.operational')}: {ops}</p>
              <div className="mt-2 flex flex-wrap gap-1">{sp.map((s) => <NavLink key={s.id} to={`../agents/${s.id}`}><Badge variant={s.status === 'operational' ? 'default' : 'secondary'} className="font-normal">{s.code}</Badge></NavLink>)}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AllAgents({ t }: { t: T }) {
  const [filter, setFilter] = useState<'all' | 'operational' | 'registered'>('all');
  const list = SPECIALISTS.filter((s) => filter === 'all' || s.status === filter);
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">{t('growthOs.agents.title')}</CardTitle>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList><TabsTrigger value="all">{t('growthOs.agents.all')}</TabsTrigger><TabsTrigger value="operational">{t('growthOs.status.operational')}</TabsTrigger><TabsTrigger value="registered">{t('growthOs.status.registered')}</TabsTrigger></TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead className="w-10">#</TableHead><TableHead>{t('growthOs.col.agent')}</TableHead><TableHead className="hidden md:table-cell">{t('growthOs.col.department')}</TableHead><TableHead className="hidden lg:table-cell">{t('growthOs.col.kpi')}</TableHead><TableHead>{t('growthOs.col.status')}</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="tabular-nums text-muted-foreground">{s.number}</TableCell>
                <TableCell><NavLink to={s.id} className="font-medium hover:underline">{s.code}</NavLink><span className="ml-2 text-muted-foreground">{s.name}</span>{s.supplementary && <Badge variant="outline" className="ml-2 font-normal">{t('growthOs.agents.supplementary')}</Badge>}</TableCell>
                <TableCell className="hidden md:table-cell">{DEPARTMENTS.find((d) => d.id === s.department)?.name}</TableCell>
                <TableCell className="hidden max-w-xs truncate text-muted-foreground lg:table-cell">{s.primaryKpi}</TableCell>
                <TableCell><StatusPill status={s.status} t={t} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ProfileFacts({ p, t }: { p: AgentProfile; t: T }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{t('growthOs.detail.responsibility')}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{p.responsibility}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{t('growthOs.detail.policy')}</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row label={t('growthOs.detail.budgetTask')} value={usd(p.budget.usdPerTask, 2)} />
          <Row label={t('growthOs.detail.budgetDay')} value={usd(p.budget.usdPerDay, 2)} />
          <Row label={t('growthOs.detail.modelExecute')} value={p.modelPolicy.execute} />
          <Row label={t('growthOs.detail.maxLevel')} value={`L${p.maxAutonomousLevel}`} />
          <Row label={t('growthOs.detail.evaluationScore')} value={p.evaluationScore === null ? t('growthOs.detail.notMeasured') : String(p.evaluationScore)} muted />
        </CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{t('growthOs.detail.dataSources')}</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">{p.dataSources.map((d) => <li key={d}>{d}</li>)}</ul></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{t('growthOs.detail.allowedActions')}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-1">{p.allowedActions.map((a) => <Badge key={a} variant="outline" className="font-normal">{a} · L{p.approvalRequirements[a]}</Badge>)}</CardContent></Card>
    </div>
  );
}

function AgentDetail({ t }: { t: T }) {
  const { agentId = '' } = useParams();
  const p = AGENT_PROFILES.find((x) => x.id === agentId && x.kind === 'specialist');
  const verifier = AGENT_PROFILES.find((x) => x.id === p?.verifierId);
  const tasks = useGrowthTasks(agentId);
  const activity = useGrowthActivity(100, agentId);
  const reports = useGrowthReports(agentId);
  const learning = useGrowthLearning();
  const approvals = useGrowthApprovals();
  if (!p) return <Navigate to=".." replace />;
  const skills = SKILLS.filter((s) => s.agentId === p.id);
  const verifications = (reports.data ?? []).filter((r) => r.kind === 'verification');
  const myLearning = (learning.data ?? []).filter((l) => l.agent_id === p.id);
  const myApprovals = (approvals.data ?? []).filter((a) => a.agent_id === p.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{p.name}</h2>
        <StatusPill status={p.status} t={t} />
        {p.status !== 'operational' && <span className="text-sm text-muted-foreground">{t('growthOs.detail.registeredOnly')}</span>}
      </div>
      <Tabs defaultValue="overview">
        <div className="overflow-x-auto"><TabsList>
          {['overview', 'tasks', 'subagent', 'skills', 'memory', 'learning', 'evaluations', 'performance', 'activity', 'approvals', 'settings'].map((k) => <TabsTrigger key={k} value={k}>{t(`growthOs.tab.${k}`)}</TabsTrigger>)}
        </TabsList></div>
        <TabsContent value="overview" className="mt-4"><ProfileFacts p={p} t={t} /></TabsContent>
        <TabsContent value="tasks" className="mt-4">
          <QueryState q={tasks} t={t} empty={(tasks.data ?? []).length === 0}>
            <Table>
              <TableHeader><TableRow><TableHead>{t('growthOs.col.objective')}</TableHead><TableHead className="hidden md:table-cell">URL</TableHead><TableHead>{t('growthOs.col.status')}</TableHead><TableHead>{t('growthOs.col.when')}</TableHead></TableRow></TableHeader>
              <TableBody>{(tasks.data ?? []).map((x) => (
                <TableRow key={x.id}><TableCell>{x.objective ?? x.type}</TableCell><TableCell className="hidden max-w-xs truncate md:table-cell">{x.input?.url}</TableCell><TableCell><StatusPill status={x.status} t={t} /></TableCell><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{ago(x.created_at)}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          </QueryState>
        </TabsContent>
        <TabsContent value="subagent" className="mt-4 space-y-4">
          {verifier && <Card><CardContent className="p-4 text-sm text-muted-foreground">{verifier.responsibility}</CardContent></Card>}
          <QueryState q={reports} t={t} empty={verifications.length === 0}>
            <ul className="space-y-2">{verifications.map((v) => {
              const b = v.body as { status?: string; findings?: string[]; recomputedScore?: number | null };
              return <li key={v.id} className="rounded-md border p-3 text-sm"><div className="flex items-center gap-2"><StatusPill status={b.status ?? 'unknown'} t={t} /><span className="text-xs text-muted-foreground">{ago(v.created_at)}</span></div>{(b.findings ?? []).length > 0 && <ul className="mt-2 list-disc pl-4 text-muted-foreground">{b.findings!.map((f) => <li key={f}>{f}</li>)}</ul>}</li>;
            })}</ul>
          </QueryState>
        </TabsContent>
        <TabsContent value="skills" className="mt-4"><SkillTable skills={skills} t={t} /></TabsContent>
        <TabsContent value="memory" className="mt-4"><NotBuilt t={t} phase="2" /></TabsContent>
        <TabsContent value="learning" className="mt-4"><LearningList rows={myLearning} q={learning} t={t} /></TabsContent>
        <TabsContent value="evaluations" className="mt-4"><NotBuilt t={t} phase="2" /></TabsContent>
        <TabsContent value="performance" className="mt-4"><NotBuilt t={t} phase="2" /></TabsContent>
        <TabsContent value="activity" className="mt-4"><EventList q={activity} t={t} /></TabsContent>
        <TabsContent value="approvals" className="mt-4"><ApprovalList rows={myApprovals} q={approvals} t={t} /></TabsContent>
        <TabsContent value="settings" className="mt-4"><Card><CardContent className="p-4 text-sm text-muted-foreground">{t('growthOs.detail.settingsInCode')}</CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}

function SkillTable({ skills, t }: { skills: typeof SKILLS; t: T }) {
  return (
    <Table>
      <TableHeader><TableRow><TableHead>{t('growthOs.col.skill')}</TableHead><TableHead>{t('growthOs.col.version')}</TableHead><TableHead className="hidden md:table-cell">{t('growthOs.col.agent')}</TableHead><TableHead>{t('growthOs.col.status')}</TableHead></TableRow></TableHeader>
      <TableBody>{skills.map((s) => (
        <TableRow key={s.id}>
          <TableCell><span className="font-medium">{s.id}</span><p className="hidden max-w-lg truncate text-xs text-muted-foreground sm:block">{s.purpose}</p></TableCell>
          <TableCell className="tabular-nums">{s.version}</TableCell>
          <TableCell className="hidden md:table-cell">{s.agentId}</TableCell>
          <TableCell><StatusPill status={s.status} t={t} /></TableCell>
        </TableRow>
      ))}</TableBody>
    </Table>
  );
}

function SkillLibrary({ t }: { t: T }) {
  const [q, setQ] = useState('');
  const skills = useMemo(() => SKILLS.filter((s) => !q || s.id.includes(q.toLowerCase()) || s.agentId.includes(q.toLowerCase())), [q]);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="text-base">{t('growthOs.skills.project')}</CardTitle><CardDescription>{t('growthOs.skills.projectHint')}</CardDescription></div>
          <Input className="sm:w-64" placeholder={t('growthOs.skills.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </CardHeader>
        <CardContent><SkillTable skills={skills} t={t} /></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{t('growthOs.skills.external')}</CardTitle><CardDescription>{t('growthOs.skills.externalHint')}</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>{t('growthOs.col.skill')}</TableHead><TableHead className="hidden md:table-cell">{t('growthOs.col.commit')}</TableHead><TableHead className="hidden lg:table-cell">{t('growthOs.col.license')}</TableHead><TableHead>{t('growthOs.col.status')}</TableHead></TableRow></TableHeader>
            <TableBody>{EXTERNAL_SKILLS.map((e) => (
              <TableRow key={e.id}>
                <TableCell><a className="font-medium hover:underline" href={`https://github.com/${e.repo}/tree/${e.commit}`} target="_blank" rel="noreferrer noopener">{e.id}</a><p className="hidden max-w-lg text-xs text-muted-foreground sm:block">{e.findings[0] ?? e.usedFor}</p></TableCell>
                <TableCell className="hidden font-mono text-xs md:table-cell">{e.commit.slice(0, 10)}</TableCell>
                <TableCell className="hidden text-xs lg:table-cell">{e.license}</TableCell>
                <TableCell><StatusPill status={e.status} t={t} /></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function LearningList({ rows, q, t }: { rows: ReturnType<typeof useGrowthLearning>['data']; q: { isLoading: boolean; error: unknown }; t: T }) {
  return (
    <QueryState q={q} t={t} empty={(rows ?? []).length === 0}>
      <ul className="space-y-2">{(rows ?? []).map((l) => (
        <li key={l.id} className="rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="font-normal">{t(`growthOs.outcome.${l.outcome}`)}</Badge><span className="text-xs text-muted-foreground">{l.agent_id} · {l.skill_version} · {l.model ?? t('growthOs.noModel')} · {ago(l.created_at)}</span></div>
          <p className="mt-2">{l.observation}</p>
          {l.proposed_change && <p className="mt-1 text-muted-foreground">{t('growthOs.learning.proposed')}: {l.proposed_change} <span className="text-xs">({t(`growthOs.status.${l.evaluation_status}`)})</span></p>}
        </li>
      ))}</ul>
    </QueryState>
  );
}

function LearningCenter({ t }: { t: T }) {
  const learning = useGrowthLearning();
  return (
    <div className="space-y-6">
      <Card><CardContent className="p-4 text-sm text-muted-foreground">{t('growthOs.learning.phase2')}</CardContent></Card>
      <LearningList rows={learning.data} q={learning} t={t} />
    </div>
  );
}

function EventList({ q, t }: { q: ReturnType<typeof useGrowthActivity>; t: T }) {
  return (
    <QueryState q={q} t={t} empty={(q.data ?? []).length === 0}>
      <ol className="relative space-y-3 border-l pl-4">
        {(q.data ?? []).map((e) => (
          <li key={e.id} className="text-sm">
            <span className={cn('absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background', e.status === 'ok' ? 'bg-success' : e.status === 'failed' ? 'bg-destructive' : 'bg-warning')} />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <time className="text-xs tabular-nums text-muted-foreground" dateTime={e.created_at}>{new Date(e.created_at).toLocaleString()}</time>
              <span className="font-medium">{e.agent_id}</span>
              <Badge variant="outline" className="font-normal">{e.phase}</Badge>
              <span>{e.action}</span>
              <StatusPill status={e.status} t={t} />
              {e.cost_usd !== null && <span className="text-xs tabular-nums text-muted-foreground">{usd(e.cost_usd, 6)}</span>}
            </div>
            {e.task_id && <p className="font-mono text-xs text-muted-foreground">task {e.task_id.slice(0, 8)} · event #{e.id}</p>}
          </li>
        ))}
      </ol>
    </QueryState>
  );
}

function ApprovalList({ rows, q, t }: { rows: ReturnType<typeof useGrowthApprovals>['data']; q: { isLoading: boolean; error: unknown }; t: T }) {
  const decide = useDecideApproval();
  return (
    <QueryState q={q} t={t} empty={(rows ?? []).length === 0}>
      <ul className="space-y-2">{(rows ?? []).map((a) => (
        <li key={a.id} className="rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><StatusPill status={a.status} t={t} /><Badge variant="outline" className="font-normal">L{a.level} · {a.action}</Badge><span className="text-xs text-muted-foreground">{a.agent_id} · {ago(a.requested_at)}</span></div>
          <p className="mt-2">{a.summary}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">sha256 {a.payload_hash.slice(0, 16)}…</p>
          {a.status === 'pending' && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, approve: true })}><CheckCircle2 className="mr-1 h-4 w-4" />{t('growthOs.approvals.approve')}</Button>
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, approve: false })}><XCircle className="mr-1 h-4 w-4" />{t('growthOs.approvals.reject')}</Button>
            </div>
          )}
        </li>
      ))}</ul>
      {decide.error && <p className="mt-2 text-sm text-destructive">{String((decide.error as Error).message)}</p>}
    </QueryState>
  );
}

function Approvals({ t }: { t: T }) {
  const approvals = useGrowthApprovals();
  return (
    <div className="space-y-4">
      <Card><CardContent className="flex items-start gap-2 p-4 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{t('growthOs.approvals.rules')}</CardContent></Card>
      <ApprovalList rows={approvals.data} q={approvals} t={t} />
    </div>
  );
}

function BudgetUsage({ t }: { t: T }) {
  const usage = useGrowthUsage(30);
  const budget = useGrowthBudget();
  const byModel = useMemo(() => {
    const m = new Map<string, { calls: number; tokens: number; usd: number; unknown: number; errors: number }>();
    for (const u of usage.data ?? []) {
      const e = m.get(u.model) ?? { calls: 0, tokens: 0, usd: 0, unknown: 0, errors: 0 };
      e.calls++; e.tokens += (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0);
      if (u.actual_usd === null) e.unknown++; else e.usd += Number(u.actual_usd);
      if (u.status !== 'ok' && u.status !== 'cache_hit') e.errors++;
      m.set(u.model, e);
    }
    return [...m.entries()];
  }, [usage.data]);
  return (
    <div className="space-y-6">
      <QueryState q={budget} t={t}>
        {budget.data && <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label={t('growthOs.budget.today')} value={usd(budget.data.spentToday)} hint={`${t('growthOs.budget.limit')} ${usd(budget.data.budget.daily_usd_limit, 2)}${budget.data.isDefault ? ` (${t('growthOs.budget.default')})` : ''}`} />
          <Stat label={t('growthOs.budget.perTask')} value={usd(budget.data.budget.task_usd_limit, 2)} />
          <Stat label={t('growthOs.budget.calls30')} value={(usage.data ?? []).length} />
        </div>}
      </QueryState>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{t('growthOs.budget.byModel')}</CardTitle><CardDescription>{t('growthOs.budget.byModelHint')}</CardDescription></CardHeader>
        <CardContent>
          <QueryState q={usage} t={t} empty={byModel.length === 0}>
            <Table>
              <TableHeader><TableRow><TableHead>{t('growthOs.col.model')}</TableHead><TableHead className="text-right">{t('growthOs.col.calls')}</TableHead><TableHead className="hidden text-right md:table-cell">{t('growthOs.col.tokens')}</TableHead><TableHead className="text-right">{t('growthOs.col.cost')}</TableHead><TableHead className="hidden text-right md:table-cell">{t('growthOs.col.errors')}</TableHead></TableRow></TableHeader>
              <TableBody>{byModel.map(([model, e]) => (
                <TableRow key={model}><TableCell className="font-mono text-xs">{model}</TableCell><TableCell className="text-right tabular-nums">{e.calls}</TableCell><TableCell className="hidden text-right tabular-nums md:table-cell">{e.tokens}</TableCell><TableCell className="text-right tabular-nums">{usd(e.usd, 6)}{e.unknown > 0 && <span className="text-muted-foreground"> +{e.unknown} {t('growthOs.budget.unknown')}</span>}</TableCell><TableCell className="hidden text-right tabular-nums md:table-cell">{e.errors}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditLog({ t }: { t: T }) {
  const audit = useGrowthAudit();
  return (
    <Card><CardContent className="pt-6">
      <QueryState q={audit} t={t} empty={(audit.data ?? []).length === 0}>
        <Table>
          <TableHeader><TableRow><TableHead>{t('growthOs.col.when')}</TableHead><TableHead>{t('growthOs.col.actor')}</TableHead><TableHead>{t('growthOs.col.event')}</TableHead><TableHead className="hidden md:table-cell">{t('growthOs.col.subject')}</TableHead></TableRow></TableHeader>
          <TableBody>{(audit.data ?? []).map((a) => (
            <TableRow key={a.id}><TableCell className="whitespace-nowrap text-xs tabular-nums">{new Date(a.created_at).toLocaleString()}</TableCell><TableCell className="text-xs">{a.actor_type}:{a.actor_id.slice(0, 12)}</TableCell><TableCell>{a.event}</TableCell><TableCell className="hidden font-mono text-xs md:table-cell">{a.subject_id?.slice(0, 8)}</TableCell></TableRow>
          ))}</TableBody>
        </Table>
      </QueryState>
    </CardContent></Card>
  );
}

function GrowthSettings({ t }: { t: T }) {
  const budget = useGrowthBudget();
  const set = useSetGrowthBudget();
  const [daily, setDaily] = useState('');
  const [task, setTask] = useState('');
  return (
    <Card className="max-w-xl">
      <CardHeader className="pb-3"><CardTitle className="text-base">{t('growthOs.settings.budget')}</CardTitle><CardDescription>{t('growthOs.settings.budgetHint')}</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); set.mutate({ daily: Number(daily || budget.data?.budget.daily_usd_limit), task: Number(task || budget.data?.budget.task_usd_limit) }); }}>
          <div className="space-y-1"><Label htmlFor="b-day">{t('growthOs.settings.daily')}</Label><Input id="b-day" type="number" step="0.01" min="0" max="1" placeholder={String(budget.data?.budget.daily_usd_limit ?? '')} value={daily} onChange={(e) => setDaily(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="b-task">{t('growthOs.settings.task')}</Label><Input id="b-task" type="number" step="0.01" min="0" placeholder={String(budget.data?.budget.task_usd_limit ?? '')} value={task} onChange={(e) => setTask(e.target.value)} /></div>
          <div className="sm:col-span-2"><Button type="submit" disabled={set.isPending}>{t('growthOs.settings.save')}</Button></div>
        </form>
        {set.error && <p className="mt-2 text-sm text-destructive">{String((set.error as Error).message)}</p>}
        {set.isSuccess && <p className="mt-2 text-sm text-success">{t('growthOs.settings.saved')}</p>}
      </CardContent>
    </Card>
  );
}

function LiveActivity({ t }: { t: T }) {
  const activity = useGrowthActivity(200);
  return <Card><CardHeader className="pb-3"><CardDescription>{t('growthOs.activity.hint')}</CardDescription></CardHeader><CardContent><EventList q={activity} t={t} /></CardContent></Card>;
}

export default function GrowthOsPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Growth OS</h1>
        <p className="text-sm text-muted-foreground">{t('growthOs.subtitle')}</p>
      </div>
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav aria-label="Growth OS" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:w-52 lg:shrink-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 lg:flex-col">
            {SECTIONS.map(({ path, key, icon: Icon }) => (
              <li key={key}>
                <NavLink end={path === ''} to={path} className={({ isActive }) => cn('flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors', isActive ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>
                  <Icon className="h-4 w-4" />{t(`growthOs.nav.${key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">
          <Routes>
            <Route index element={<CommandCenter t={t} />} />
            <Route path="ceo" element={<GlobalCeo t={t} />} />
            <Route path="departments" element={<Departments t={t} />} />
            <Route path="agents" element={<AllAgents t={t} />} />
            <Route path="agents/:agentId" element={<AgentDetail t={t} />} />
            <Route path="activity" element={<LiveActivity t={t} />} />
            <Route path="skills" element={<SkillLibrary t={t} />} />
            <Route path="learning" element={<LearningCenter t={t} />} />
            <Route path="experiments" element={<NotBuilt t={t} phase="2" />} />
            <Route path="analytics" element={<AnalyticsDashboard t={t} />} />
            <Route path="approvals" element={<Approvals t={t} />} />
            <Route path="budget" element={<BudgetUsage t={t} />} />
            <Route path="audit" element={<AuditLog t={t} />} />
            <Route path="settings" element={<GrowthSettings t={t} />} />
            <Route path="*" element={<Navigate to="." replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
