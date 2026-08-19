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
      <div className="max-w-3xl mx-auto p-1 pb-8">
        <IcpWizard
          existing={editingIcp}
          onClose={() => { setView("list"); setEditingIcp(null); }}
          onSaved={(id) => { setView("list"); setEditingIcp(null); }}
        />
      </div>
    );
  }

  // ─── MATCHES VIEW ─────────────────────────────────────────
  if (view === "matches" && selectedIcpId) {
    return (
      <div className="flex flex-col gap-6 p-1 pb-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => setView("list")} className="mb-2 gap-1.5 text-muted-foreground">
              {t('icp.backToIcps')}
            </Button>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              {t('icp.leadMatches').replace('{name}', selectedIcp?.name || '')}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('icp.leadsScored').replace('{count}', String(scores.length))} • {t('icp.sortedByBestMatch')}
            </p>
          </div>
          <Button
            onClick={() => handleScore(selectedIcpId)}
            disabled={scoreLeads.isPending}
            className="gap-1.5"
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
          <Card className="p-12 text-center">
            <Target className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-foreground mb-1">{t('icp.noScoresYet')}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('icp.noScoresDesc')}
            </p>
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
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
                    <TableRow key={s.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setScoreDetailId(s.id)}>
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
    <div className="flex flex-col gap-6 p-1 pb-8 max-w-6xl mx-auto">
      {/* Hero */}
      <div className="flex items-center justify-between pt-4">
        <div>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mb-2">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t('icp.title')}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t('icp.subtitle')}
          </p>
        </div>
        <Button onClick={() => { setEditingIcp(null); setView("wizard"); }} className="gap-1.5">
          <Plus className="h-4 w-4" /> {t('icp.createIcp')}
        </Button>
      </div>

      {/* Stats */}
      {profiles.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{profiles.length}</p>
            <p className="text-xs text-muted-foreground">{t('icp.totalIcps')}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{profiles.filter(p => p.is_default).length}</p>
            <p className="text-xs text-muted-foreground">{t('icp.defaultLabel')}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{profiles.reduce((a, p) => a + p.industry.length, 0)}</p>
            <p className="text-xs text-muted-foreground">{t('icp.industriesTargeted')}</p>
          </Card>
          <Card className="p-4 text-center">
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
        <Card className="p-12 text-center">
          <Target className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">{t('icp.noIcpsYet')}</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            {t('icp.noIcpsDesc')}
          </p>
          <Button onClick={() => { setEditingIcp(null); setView("wizard"); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> {t('icp.createFirstIcp')}
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {profiles.map((icp) => (
            <Card key={icp.id} className="p-5 space-y-3 hover:border-primary/30 transition-colors">
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
