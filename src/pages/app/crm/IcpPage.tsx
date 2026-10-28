import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  Target, Plus, Trash2, Star, Loader2, Eye, Zap,
  BarChart3, Users, MapPin, Building2, ChevronRight, ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  useIcpProfiles, useDeleteIcpProfile, useSetDefaultIcp,
  useLeadIcpScores, useScoreLeadsAgainstIcp,
  type IcpProfile,
} from "@/hooks/api/useIcp";
import IcpWizard from "@/components/icp/IcpWizard";
import IcpScoreBreakdown from "@/components/icp/IcpScoreBreakdown";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { WorkspaceFrame, WorkspaceSurface } from "@/components/workspace/WorkspacePanel";

function scoreTierBadge(score: number) {
  if (score >= 80) return <Badge variant="outline" className="bg-success/15 text-success border-success/20 text-xs">Hot</Badge>;
  if (score >= 60) return <Badge variant="outline" className="bg-primary/15 text-primary border-primary/20 text-xs">Good</Badge>;
  if (score >= 40) return <Badge variant="outline" className="bg-warning/15 text-warning border-warning/20 text-xs">Maybe</Badge>;
  return <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/20 text-xs">Poor</Badge>;
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
      <div className="workspace-theme space-y-4">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => { setView("list"); setEditingIcp(null); }}>
          <ChevronLeft className="h-3.5 w-3.5" /> {t('icp.backToIcps')}
        </Button>
        <Card className="mx-auto max-w-3xl">
          <CardContent className="p-5 sm:p-8">
            <IcpWizard
              existing={editingIcp}
              onClose={() => { setView("list"); setEditingIcp(null); }}
              onSaved={() => { setView("list"); setEditingIcp(null); }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── MATCHES VIEW ─────────────────────────────────────────
  if (view === "matches" && selectedIcpId) {
    return (
      <div className="workspace-theme space-y-6">
        <div>
          <Button variant="ghost" size="sm" className="gap-1.5 mb-3" onClick={() => setView("list")}>
            <ChevronLeft className="h-3.5 w-3.5" /> {t('icp.backToIcps')}
          </Button>
          <PageHeader
            eyebrow={t('nav.crm')}
            title={
              <span className="flex items-center gap-3">
                <BarChart3 className="h-6 w-6 text-primary" />
                {t('icp.leadMatches').replace('{name}', selectedIcp?.name || '')}
              </span>
            }
            description={`${t('icp.leadsScored').replace('{count}', String(scores.length))} · ${t('icp.sortedByBestMatch')}`}
            actions={
              <Button onClick={() => handleScore(selectedIcpId)} disabled={scoreLeads.isPending} className="gap-1.5">
                {scoreLeads.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {t('icp.reScoreLeads')}
              </Button>
            }
          />
        </div>

        {scoresLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : scores.length === 0 ? (
          <EmptyState icon={Target} title={t('icp.noScoresYet')} hint={t('icp.noScoresDesc')} />
        ) : (
          <Card className="overflow-hidden p-0">
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
                    <TableRow key={s.id} className="cursor-pointer transition-colors hover:bg-muted/50" onClick={() => setScoreDetailId(s.id)}>
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
    <div className="workspace-theme space-y-6">
      <PageHeader
        eyebrow={t('nav.crm')}
        title={t('icp.title')}
        description={t('icp.subtitle')}
        stats={profiles.length > 0 ? [
          { value: profiles.length, label: t('icp.totalIcps') },
          { value: profiles.filter(p => p.is_default).length, label: t('icp.defaultLabel') },
          { value: profiles.reduce((a, p) => a + p.industry.length, 0), label: t('icp.industriesTargeted') },
          { value: profiles.reduce((a, p) => a + p.target_countries.length, 0), label: t('icp.countries') },
        ] : undefined}
        actions={
          <Button onClick={() => { setEditingIcp(null); setView("wizard"); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> {t('icp.createIcp')}
          </Button>
        }
      />

      {/* ICP Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : profiles.length === 0 ? (
        <WorkspaceFrame>
          <WorkspaceSurface className="rounded-[22px] p-4">
            <EmptyState
              icon={Target}
              title={t('icp.noIcpsYet')}
              hint={t('icp.noIcpsDesc')}
              action={{ label: t('icp.createFirstIcp'), onClick: () => { setEditingIcp(null); setView("wizard"); }, icon: Plus }}
            />
          </WorkspaceSurface>
        </WorkspaceFrame>
      ) : (
        <WorkspaceFrame>
          <WorkspaceSurface className="rounded-[22px] p-4">
            <div className="grid gap-3 md:grid-cols-2">
          {profiles.map((icp) => (
            <Card key={icp.id} className="space-y-4 border-workspace-surface-line p-6 shadow-none">
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
          </WorkspaceSurface>
        </WorkspaceFrame>
      )}
    </div>
  );
}
