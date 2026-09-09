import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Target, Plus, Trash2, Star, Loader2, Search, Eye, Zap,
  BarChart3, Users, MapPin, Building2, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  useIcpProfiles, useDeleteIcpProfile, useSetDefaultIcp,
  useLeadIcpScores, useScoreLeadsAgainstIcp,
  type IcpProfile,
} from "@/hooks/api/useIcp";
import IcpWizard from "@/components/icp/IcpWizard";
import IcpScoreBreakdown from "@/components/icp/IcpScoreBreakdown";
import { useI18n } from "@/lib/i18n";

function scoreTierBadge(score: number) {
  if (score >= 80) return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-xs">Hot</Badge>;
  if (score >= 60) return <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/20 text-xs">Good</Badge>;
  if (score >= 40) return <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-xs">Maybe</Badge>;
  return <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/20 text-xs">Poor</Badge>;
}

export default function IcpPage() {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "wizard" | "matches">("list");
  const [editingIcp, setEditingIcp] = useState<IcpProfile | null>(null);
  const [selectedIcpId, setSelectedIcpId] = useState<string | null>(null);
  const [scoreDetailId, setScoreDetailId] = useState<string | null>(null);

  const { data: profiles = [], isLoading } = useIcpProfiles();
  const deleteIcp = useDeleteIcpProfile();
  const setDefault = useSetDefaultIcp();
  const scoreLeads = useScoreLeadsAgainstIcp();
  const { data: scores = [], isLoading: scoresLoading } = useLeadIcpScores(selectedIcpId);

  const selectedIcp = profiles.find((p) => p.id === selectedIcpId);
  const detailScore = scores.find((s) => s.id === scoreDetailId);

  const handleDelete = (id: string) => {
    deleteIcp.mutate(id, {
      onSuccess: () => toast.success(t('icp.archived')),
      onError: (e) => toast.error(e.message),
    });
  };

  const handleScore = (id: string) => {
    setSelectedIcpId(id);
    scoreLeads.mutate(id, {
      onSuccess: (d) => {
        toast.success(t('icp.scoredCount').replace('{count}', String(d.scored_count)));
        setView("matches");
      },
      onError: (e) => toast.error(e.message),
    });
  };

  // ─── WIZARD VIEW ──────────────────────────────────────────
  if (view === "wizard") {
    return (
      <div className="relative -m-4 min-h-[calc(100vh-76px)] overflow-hidden bg-[radial-gradient(circle_at_8%_4%,rgba(82,113,255,0.28),transparent_27%),radial-gradient(circle_at_92%_8%,rgba(236,124,255,0.20),transparent_25%),linear-gradient(135deg,#f8fbff_0%,#edf4ff_52%,#f9f2ff_100%)] p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-[2.25rem] border border-white/70 bg-white/68 p-5 shadow-[0_30px_100px_rgba(42,62,130,0.20)] backdrop-blur-2xl sm:p-8">
          <IcpWizard
            existing={editingIcp}
            onClose={() => { setView("list"); setEditingIcp(null); }}
            onSaved={() => { setView("list"); setEditingIcp(null); }}
          />
        </div>
      </div>
    );
  }

  // ─── MATCHES VIEW ─────────────────────────────────────────
  if (view === "matches" && selectedIcpId) {
    return (
      <div className="relative -m-4 min-h-[calc(100vh-76px)] space-y-6 overflow-hidden bg-[radial-gradient(circle_at_8%_4%,rgba(82,113,255,0.28),transparent_27%),radial-gradient(circle_at_92%_8%,rgba(236,124,255,0.20),transparent_25%),linear-gradient(135deg,#f8fbff_0%,#edf4ff_52%,#f9f2ff_100%)] p-4 text-slate-950 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
        <div className="mx-auto flex max-w-[1500px] flex-col justify-between gap-5 rounded-[2.25rem] border border-white/70 bg-white/62 p-6 shadow-[0_30px_100px_rgba(42,62,130,0.20)] backdrop-blur-2xl sm:flex-row sm:items-end sm:p-8">
          <div>
            <Button variant="ghost" size="sm" onClick={() => setView("list")} className="mb-4 rounded-full border border-white/70 bg-white/70 text-slate-500">
              {t('icp.backToIcps')}
            </Button>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-blue-600">ICP · Match intelligence</p>
            <h1 className="mt-3 flex items-center gap-3 text-[34px] font-semibold tracking-[-0.045em] text-slate-950 sm:text-[46px]">
              <BarChart3 className="h-7 w-7 text-blue-600" />
              {t('icp.leadMatches').replace('{name}', selectedIcp?.name || '')}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {t('icp.leadsScored').replace('{count}', String(scores.length))} • {t('icp.sortedByBestMatch')}
            </p>
          </div>
          <Button
            onClick={() => handleScore(selectedIcpId)}
            disabled={scoreLeads.isPending}
            className="h-11 gap-1.5 rounded-full bg-slate-950 px-5 text-white shadow-[0_16px_34px_rgba(15,23,42,0.24)] hover:bg-slate-800"
          >
            {scoreLeads.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {t('icp.reScoreLeads')}
          </Button>
        </div>

        {scoresLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : scores.length === 0 ? (
          <Card className="mx-auto max-w-[1500px] rounded-[2rem] border-white/70 bg-white/68 p-12 text-center shadow-[0_24px_80px_rgba(45,77,150,0.13)] backdrop-blur-2xl">
            <Target className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-foreground mb-1">{t('icp.noScoresYet')}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('icp.noScoresDesc')}
            </p>
          </Card>
        ) : (
          <Card className="mx-auto max-w-[1500px] overflow-hidden rounded-[2rem] border-white/70 bg-white/68 p-0 shadow-[0_24px_80px_rgba(45,77,150,0.13)] backdrop-blur-2xl">
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('icp.lead')}</TableHead>
                    <TableHead>{t('icp.industry')}</TableHead>
                    <TableHead className="text-center">{t('icp.score')}</TableHead>
                    <TableHead className="text-center">{t('icp.tier')}</TableHead>
                    <TableHead>{t('icp.action')}</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scores.map((s) => (
                    <TableRow key={s.id} className="cursor-pointer border-white/80 transition-colors hover:bg-blue-50/70" onClick={() => setScoreDetailId(s.id)}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-foreground">{s.leads?.name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{s.leads?.company_name || s.leads?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.leads?.industry || "—"}</TableCell>
                      <TableCell className="text-center">
                        <span className="text-lg font-bold text-foreground">{s.total_score}</span>
                      </TableCell>
                      <TableCell className="text-center">{scoreTierBadge(s.total_score)}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{s.recommended_action || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </Card>
        )}

        {/* Score detail dialog */}
        <Dialog open={!!scoreDetailId} onOpenChange={(o) => !o && setScoreDetailId(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('icp.scoreBreakdown')}</DialogTitle>
            </DialogHeader>
            {detailScore && (
              <IcpScoreBreakdown
                score={detailScore}
                leadName={detailScore.leads?.name}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── LIST VIEW (default) ──────────────────────────────────
  return (
    <div className="relative -m-4 min-h-[calc(100vh-76px)] space-y-6 overflow-hidden bg-[radial-gradient(circle_at_8%_4%,rgba(82,113,255,0.28),transparent_27%),radial-gradient(circle_at_92%_8%,rgba(236,124,255,0.20),transparent_25%),linear-gradient(135deg,#f8fbff_0%,#edf4ff_52%,#f9f2ff_100%)] p-4 text-slate-950 before:pointer-events-none before:absolute before:-left-32 before:top-16 before:h-[520px] before:w-[520px] before:rounded-full before:bg-blue-400/15 before:blur-3xl after:pointer-events-none after:absolute after:-right-40 after:top-0 after:h-[440px] after:w-[540px] after:rounded-full after:bg-fuchsia-300/20 after:blur-3xl [&>*]:relative sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      {/* ICP cockpit — mirrors the dashboard composition */}
      <section className="mx-auto max-w-[1500px] overflow-hidden rounded-[2.25rem] border border-white/70 bg-white/58 shadow-[0_30px_100px_rgba(42,62,130,0.20)] backdrop-blur-2xl">
        <div className="grid lg:grid-cols-[minmax(0,1.45fr)_380px]">
          <div className="p-6 sm:p-8 lg:p-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-blue-600">CRM · ICP cockpit</p>
            <h1 className="mt-4 text-[40px] font-semibold leading-[0.96] tracking-[-0.055em] text-slate-950 sm:text-[54px]">
              Find kunder, der passer.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-7 text-slate-600">{t('icp.subtitle')}</p>
            <Button onClick={() => { setEditingIcp(null); setView("wizard"); }} className="mt-7 h-11 gap-1.5 rounded-full bg-slate-950 px-5 text-white shadow-[0_16px_34px_rgba(15,23,42,0.24)] hover:bg-slate-800">
              <Plus className="h-4 w-4" /> {t('icp.createIcp')}
            </Button>
          </div>
          <div className="relative border-t border-white/60 bg-slate-950/92 p-6 text-white lg:border-l lg:border-t-0 lg:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_5%,rgba(92,124,255,0.52),transparent_34%),radial-gradient(circle_at_100%_30%,rgba(244,114,255,0.28),transparent_38%)]" />
            <div className="relative">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">Live targeting signal</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Match engine</h2></div><span className="grid h-12 w-12 place-items-center rounded-full bg-white/10"><Target className="h-5 w-5 text-cyan-200" /></span></div>
              <div className="mt-7 grid grid-cols-2 gap-3">
                <IcpSignal label={t('icp.totalIcps')} value={profiles.length} />
                <IcpSignal label={t('icp.defaultLabel')} value={profiles.filter(p => p.is_default).length} />
                <IcpSignal label={t('icp.industriesTargeted')} value={profiles.reduce((a, p) => a + p.industry.length, 0)} />
                <IcpSignal label={t('icp.countries')} value={profiles.reduce((a, p) => a + p.target_countries.length, 0)} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      {profiles.length > 0 && (
        <div className="mx-auto grid max-w-[1500px] grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="rounded-[1.75rem] border-white/70 bg-white/68 p-5 text-center shadow-[0_18px_55px_rgba(45,77,150,0.11)] backdrop-blur-xl">
            <p className="text-2xl font-bold text-foreground">{profiles.length}</p>
            <p className="text-xs text-muted-foreground">{t('icp.totalIcps')}</p>
          </Card>
          <Card className="rounded-[1.75rem] border-white/70 bg-white/68 p-5 text-center shadow-[0_18px_55px_rgba(45,77,150,0.11)] backdrop-blur-xl">
            <p className="text-2xl font-bold text-foreground">{profiles.filter(p => p.is_default).length}</p>
            <p className="text-xs text-muted-foreground">{t('icp.defaultLabel')}</p>
          </Card>
          <Card className="rounded-[1.75rem] border-white/70 bg-white/68 p-5 text-center shadow-[0_18px_55px_rgba(45,77,150,0.11)] backdrop-blur-xl">
            <p className="text-2xl font-bold text-foreground">{profiles.reduce((a, p) => a + p.industry.length, 0)}</p>
            <p className="text-xs text-muted-foreground">{t('icp.industriesTargeted')}</p>
          </Card>
          <Card className="rounded-[1.75rem] border-white/70 bg-white/68 p-5 text-center shadow-[0_18px_55px_rgba(45,77,150,0.11)] backdrop-blur-xl">
            <p className="text-2xl font-bold text-foreground">{profiles.reduce((a, p) => a + p.target_countries.length, 0)}</p>
            <p className="text-xs text-muted-foreground">{t('icp.countries')}</p>
          </Card>
        </div>
      )}

      {/* ICP Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : profiles.length === 0 ? (
        <Card className="mx-auto w-full max-w-[1500px] overflow-hidden rounded-[2rem] border-white/70 bg-white/68 p-12 text-center shadow-[0_24px_80px_rgba(45,77,150,0.13)] backdrop-blur-2xl">
          <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white shadow-[0_18px_40px_rgba(82,113,255,0.28)]"><Target className="h-7 w-7" /></span>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600">Start targeting</p>
          <h3 className="mb-2 mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{t('icp.noIcpsYet')}</h3>
          <p className="mx-auto mb-6 max-w-md text-sm leading-6 text-slate-500">
            {t('icp.noIcpsDesc')}
          </p>
          <Button onClick={() => { setEditingIcp(null); setView("wizard"); }} className="h-11 gap-1.5 rounded-full bg-slate-950 px-5 text-white shadow-[0_16px_34px_rgba(15,23,42,0.24)] hover:bg-slate-800">
            <Plus className="h-4 w-4" /> {t('icp.createFirstIcp')}
          </Button>
        </Card>
      ) : (
        <div className="mx-auto grid w-full max-w-[1500px] gap-4 md:grid-cols-2">
          {profiles.map((icp) => (
            <Card key={icp.id} className="space-y-4 rounded-[2rem] border-white/70 bg-white/68 p-6 shadow-[0_24px_80px_rgba(45,77,150,0.11)] backdrop-blur-2xl transition-all hover:-translate-y-1 hover:bg-white/85">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">{icp.name}</h3>
                    {icp.is_default && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">{t('icp.defaultLabel')}</Badge>}
                  </div>
                  {icp.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{icp.description}</p>
                  )}
                </div>
              </div>

              {/* Tags summary */}
              <div className="flex flex-wrap gap-1.5">
                {icp.industry.slice(0, 3).map((ind) => (
                  <Badge key={ind} variant="secondary" className="text-xs gap-1">
                    <Building2 className="h-3 w-3" /> {ind}
                  </Badge>
                ))}
                {icp.target_countries.slice(0, 2).map((c) => (
                  <Badge key={c} variant="secondary" className="text-xs gap-1">
                    <MapPin className="h-3 w-3" /> {c}
                  </Badge>
                ))}
                {(icp.min_employees || icp.max_employees) && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Users className="h-3 w-3" /> {icp.min_employees || 0}–{icp.max_employees || "∞"}
                  </Badge>
                )}
                {icp.industry.length > 3 && (
                  <Badge variant="outline" className="text-xs">{t('icp.moreCount').replace('{count}', String(icp.industry.length - 3))}</Badge>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => handleScore(icp.id)}
                  disabled={scoreLeads.isPending}
                  className="gap-1.5 flex-1"
                >
                  {scoreLeads.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  {t('icp.scoreLeads')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setSelectedIcpId(icp.id); setView("matches"); }}
                  className="gap-1.5"
                >
                  <Eye className="h-3.5 w-3.5" /> {t('icp.matches')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setEditingIcp(icp); setView("wizard"); }}
                >
                  {t('icp.edit')}
                </Button>
                {!icp.is_default && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setDefault.mutate(icp.id)}
                  >
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  onClick={() => handleDelete(icp.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function IcpSignal({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl">
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.15em] text-white/42">{label}</p>
      <p className="mt-4 text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{value}</p>
    </div>
  );
}
