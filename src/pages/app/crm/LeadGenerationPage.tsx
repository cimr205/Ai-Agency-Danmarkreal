import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import LeadGenLoadingExperience from "@/components/leadgen/LeadGenLoadingExperience";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search, Loader2, Sparkles, X, Check, ChevronDown, History,
  Trash2, BookmarkPlus, Play, Eye, Ban, Download, FolderPlus, FolderOpen,
  ExternalLink, Globe, ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  useLeadGenSessions,
  useLeadGenSession,
  useCreateSession,
  useCancelSession,
  useImportResults,
  useSavedSearches,
  useSaveSearch,
  useDeleteSavedSearch,
  type LeadGenResult,
} from "@/hooks/api/useLeadGen";
import { useLeadFolders, useCreateLeadFolder } from "@/hooks/api/useLeads";
import type { Tables } from "@/integrations/supabase/types";

type LeadFolder = Tables<'lead_folders'>;

// ─── Helpers ────────────────────────────────────────────────
function emailBadge(status: LeadGenResult["email_status"]) {
  const map = {
    verified: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    likely_valid: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    unverified: "bg-orange-500/15 text-orange-400 border-orange-500/20",
    missing: "bg-muted text-muted-foreground border-border",
  };
  return map[status] || map.missing;
}

const EMAIL_STATUS_LABEL: Record<string, string> = {
  verified: "Verificeret",
  likely_valid: "Sandsynligvis gyldig",
  unverified: "Ikke verificeret",
  missing: "Mangler",
};

function validationBadge(status: LeadGenResult["validation_status"]) {
  const map = {
    valid: { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", Icon: ShieldCheck },
    risky: { cls: "bg-amber-500/15 text-amber-400 border-amber-500/20", Icon: ShieldAlert },
    invalid: { cls: "bg-red-500/15 text-red-400 border-red-500/20", Icon: ShieldX },
    unknown: { cls: "bg-muted text-muted-foreground border-border", Icon: ShieldQuestion },
  };
  return map[status] || map.unknown;
}

function activeBadge(status: LeadGenResult["active_status"]) {
  const map = {
    active_likely: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    uncertain: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    inactive_likely: "bg-red-500/15 text-red-400 border-red-500/20",
  };
  return map[status] || map.uncertain;
}

function scoreBadge(score: number) {
  if (score >= 70) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
  if (score >= 40) return "bg-amber-500/15 text-amber-400 border-amber-500/20";
  return "bg-red-500/15 text-red-400 border-red-500/20";
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    done: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    running: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    failed: "bg-red-500/15 text-red-400 border-red-500/20",
    cancelled: "bg-muted text-muted-foreground border-border",
  };
  return map[status] || map.pending;
}

// ─── Main Component ─────────────────────────────────────────
export default function LeadGenerationPage() {
  const { t, locale } = useI18n();

  // Form state
  const [query, setQuery] = useState("");
  const [_minLeads] = useState(20); // kept for saved search compat
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [niche, setNiche] = useState("");
  const [excludeKeywords, setExcludeKeywords] = useState("");
  const [mustEmail, setMustEmail] = useState(false);
  const [mustPhone, setMustPhone] = useState(false);
  const [mustWebsite, setMustWebsite] = useState(false);
  const [scoreThreshold, setScoreThreshold] = useState(0);

  // Active session
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [importFolderDialogOpen, setImportFolderDialogOpen] = useState(false);
  const [importFolderId, setImportFolderId] = useState<string>("none");
  const [importMode, setImportMode] = useState<"selected" | "all">("selected");
  const [newFolderName, setNewFolderName] = useState("");

  // Queries
  const sessionsQuery = useLeadGenSessions();
  const sessionQuery = useLeadGenSession(activeSessionId);
  const savedQuery = useSavedSearches();

  // Mutations
  const createSession = useCreateSession();
  const cancelSession = useCancelSession();
  const importResults = useImportResults();
  const saveSearch = useSaveSearch();
  const deleteSaved = useDeleteSavedSearch();
  const { data: folders } = useLeadFolders();
  const createFolder = useCreateLeadFolder();
  const activeSession = sessionQuery.data;
  const results = activeSession?.results || [];
  const isRunning = activeSession?.status === "pending" || activeSession?.status === "running";

  const currentFilters = useMemo(() => ({
    city: city || undefined,
    country: country || undefined,
    niche: niche || undefined,
    must_have_email: mustEmail || undefined,
    must_have_phone: mustPhone || undefined,
    must_have_website: mustWebsite || undefined,
    score_threshold: scoreThreshold > 0 ? scoreThreshold : undefined,
    exclude_keywords: excludeKeywords || undefined,
  }), [city, country, niche, excludeKeywords, mustEmail, mustPhone, mustWebsite, scoreThreshold]);

  // ─── Actions ──────────────────────────────────────────────
  const handleStartSearch = () => {
    if (!query.trim()) { toast.error(t("leadGen.emptySearch")); return; }
    createSession.mutate(
      { query: query.trim(), filters: currentFilters },
      {
        onSuccess: (session) => {
          setActiveSessionId(session.id);
          setSelectedIds(new Set());
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleCancel = () => {
    if (!activeSessionId) return;
    cancelSession.mutate(activeSessionId, { onError: (e) => toast.error(e.message) });
  };

  const handleImport = () => {
    if (!activeSessionId || selectedIds.size === 0) return;
    setImportMode("selected");
    setImportFolderId("none");
    setImportFolderDialogOpen(true);
  };

  const handleImportAll = () => {
    if (!activeSessionId) return;
    const importable = results.filter((r) => !r.imported);
    if (importable.length === 0) { toast.info(t("leadGen.allImported") || "All leads already imported"); return; }
    setImportMode("all");
    setImportFolderId("none");
    setImportFolderDialogOpen(true);
  };

  const confirmImport = () => {
    if (!activeSessionId) return;
    const idsToImport = importMode === "all"
      ? results.filter((r) => !r.imported).map((r) => r.id)
      : Array.from(selectedIds);
    if (idsToImport.length === 0) return;
    const folderId = importFolderId !== "none" ? importFolderId : undefined;
    importResults.mutate(
      { sessionId: activeSessionId, resultIds: idsToImport, folderId },
      {
        onSuccess: (data) => {
          const count = data.imported_count || data.data?.imported || idsToImport.length;
          toast.success(t("leadGen.leadsImported").replace("{count}", String(count)));
          setSelectedIds(new Set());
          setImportFolderDialogOpen(false);
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const handleSaveSearch = () => {
    if (!saveName.trim() || !query.trim()) return;
    saveSearch.mutate(
      { name: saveName.trim(), query: query.trim(), filters: currentFilters },
      {
        onSuccess: () => { toast.success(t("common.saved")); setSaveName(""); },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const loadSavedSearch = (saved: { query: string; filters: Record<string, unknown> }) => {
    setQuery(saved.query);
    const f = saved.filters as Record<string, unknown> & { city?: string; country?: string; niche?: string; exclude_keywords?: string; must_have_email?: boolean; must_have_phone?: boolean; must_have_website?: boolean; score_threshold?: number };
    // min_leads no longer used
    if (f.city) setCity(f.city);
    if (f.country) setCountry(f.country);
    if (f.niche) setNiche(f.niche);
    if (f.exclude_keywords) setExcludeKeywords(f.exclude_keywords);
    if (f.must_have_email) setMustEmail(true);
    if (f.must_have_phone) setMustPhone(true);
    if (f.must_have_website) setMustWebsite(true);
    if (f.score_threshold) setScoreThreshold(f.score_threshold);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const selectable = results.filter((r) => !r.imported);
    if (selectedIds.size === selectable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectable.map((r) => r.id)));
    }
  };

  const allSelected = results.filter((r) => !r.imported).length > 0 &&
    selectedIds.size === results.filter((r) => !r.imported).length;

  const COUNTRIES = [
    { value: "dk", label: t("leadGen.countryDK") },
    { value: "no", label: t("leadGen.countryNO") },
    { value: "se", label: t("leadGen.countrySE") },
    { value: "de", label: t("leadGen.countryDE") },
    { value: "gb", label: t("leadGen.countryGB") },
    { value: "us", label: "USA 🇺🇸" },
  ];

  const getEmail = (r: LeadGenResult) => r.email || r.business_email;

  // ─── RENDER ───────────────────────────────────────────────
  return (
    <TooltipProvider>
    <div className="flex flex-col gap-6 p-1 pb-8 max-w-7xl mx-auto">
      {/* HERO */}
      <div className="text-center pt-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-3">
          <Sparkles className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">{t("leadGen.title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("leadGen.subtitle")}</p>
      </div>

      {/* ── SEARCH FORM ─────────────────────────────────────── */}
      <Card className="p-5 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isRunning && handleStartSearch()}
              placeholder={t("leadGen.searchPlaceholder")}
              className="pl-9"
            />
          </div>
          <Button
            onClick={handleStartSearch}
            disabled={isRunning || createSession.isPending}
            className="gap-2"
          >
            {createSession.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {t("leadGen.searchButton")}
          </Button>
        </div>

        {/* Filters grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("leadGen.cityLabel")}</label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("leadGen.cityPlaceholder")} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("leadGen.countryLabel")}</label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger><SelectValue placeholder={t("leadGen.countryPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("leadGen.nicheLabel")}</label>
            <Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder={t("leadGen.nichePlaceholder")} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t("leadGen.scoreThreshold")}: {scoreThreshold}
            </label>
            <Slider value={[scoreThreshold]} onValueChange={([v]) => setScoreThreshold(v)} min={0} max={100} step={5} className="mt-2" />
          </div>
        </div>

        {/* Exclude keywords */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("leadGen.excludeKeywordsLabel")}</label>
          <Input value={excludeKeywords} onChange={(e) => setExcludeKeywords(e.target.value)} placeholder={t("leadGen.excludeKeywordsPlaceholder")} />
        </div>

        {/* Checkbox filters + save */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <Checkbox checked={mustEmail} onCheckedChange={(v) => setMustEmail(!!v)} />
              {t("leadGen.mustEmail")}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <Checkbox checked={mustPhone} onCheckedChange={(v) => setMustPhone(!!v)} />
              {t("leadGen.mustPhone")}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <Checkbox checked={mustWebsite} onCheckedChange={(v) => setMustWebsite(!!v)} />
              {t("leadGen.mustWebsite")}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder={t("leadGen.saveSearchName")}
              className="w-48 h-8 text-sm"
            />
            <Button
              size="sm" variant="outline"
              onClick={handleSaveSearch}
              disabled={!saveName.trim() || !query.trim() || saveSearch.isPending}
              className="gap-1.5"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />{t("common.save")}
            </Button>
          </div>
        </div>
      </Card>

      {/* ── LIVE PROGRESS ───────────────────────────────────── */}
      {activeSession && isRunning && (
        <LeadGenLoadingExperience
          progress={activeSession.progress}
          progressLabel={activeSession.progress_label}
          resultsCount={activeSession.results_count}
          query={activeSession.query}
          onCancel={handleCancel}
        />
      )}

      {/* Error state */}
      {activeSession?.status === "failed" && (
        <Card className="p-5 border-destructive/30">
          <p className="text-destructive text-sm">
            {t("leadGen.errorSearchFailed")}: {activeSession.error_message || t("leadGen.errorRetry")}
          </p>
        </Card>
      )}

      {/* ── EMPTY STATE ───── */}
      {activeSession?.status === "done" && results.length === 0 && (
        <Card className="p-8 text-center animate-fade-in">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/10 mb-3">
            <Ban className="h-6 w-6 text-amber-400" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            {t("leadGen.noNewResults") || "No new leads found"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {activeSession.progress_label || t("leadGen.allDuplicated") || "All companies found already exist in your database."}
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => { setActiveSessionId(null); setQuery(""); }}>
            {t("leadGen.newSearch") || "New search"}
          </Button>
        </Card>
      )}

      {/* ── RESULTS TABLE ───────────────────────────────────── */}
      {(activeSession?.status === "done" || (activeSession?.status === "running" && results.length > 0)) && results.length > 0 && (
        <Card className="p-0 overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              {t("leadGen.foundCompanies").replace("{count}", String(results.length))}
            </h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleImportAll}
                disabled={importResults.isPending || results.filter(r => !r.imported).length === 0} className="gap-1.5">
                {importResults.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {t("leadGen.importAll") || "Import all"} ({results.filter(r => !r.imported).length})
              </Button>
              <Button size="sm" onClick={handleImport} disabled={selectedIds.size === 0 || importResults.isPending} className="gap-1.5">
                {importResults.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {t("leadGen.importSelected")} ({selectedIds.size})
              </Button>
            </div>
          </div>
          <ScrollArea className="max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead>{t("leadGen.colCompany")}</TableHead>
                  <TableHead>Kontaktperson</TableHead>
                  <TableHead>{t("common.email")}</TableHead>
                  <TableHead>{t("common.phone")}</TableHead>
                  <TableHead>{t("leadGen.colWebsite")}</TableHead>
                  <TableHead>{t("leadGen.colCity")}</TableHead>
                  <TableHead>{t("leadGen.colScore")}</TableHead>
                  <TableHead>Kilder</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => {
                  const email = getEmail(r);
                  return (
                    <TableRow key={r.id} className={r.imported ? "opacity-50" : ""}>
                      <TableCell>
                        {r.imported ? (
                          <Check className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} />
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">{r.company_name}</span>
                          {r.niche && <span className="block text-[11px] text-muted-foreground">{r.niche}</span>}
                          {r.review_count > 0 && (
                            <span className="block text-[10px] text-muted-foreground">
                              ⭐ {r.rating || "?"} ({r.review_count} reviews)
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.contact_person_name ? (
                          <div>
                            <span className="text-sm font-medium">{r.contact_person_name}</span>
                            {r.contact_role && <span className="block text-[10px] text-muted-foreground">{r.contact_role}</span>}
                            {r.linkedin_url && (
                              <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-primary hover:underline">LinkedIn</a>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {email ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm truncate max-w-[160px]">{email}</span>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${emailBadge(r.email_status)}`}>
                                {EMAIL_STATUS_LABEL[r.email_status] ?? r.email_status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">
                                {r.email_type === "personal" ? "👤 Personlig" : "📧 Generisk"} · {r.email_confidence || 0}% konf.
                              </span>
                            </div>
                          </div>
                        ) : (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${emailBadge("missing")}`}>
                            {t("leadGen.emailMissing")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{r.phone || "—"}</TableCell>
                      <TableCell>
                        {r.website ? (
                          <a href={r.website.startsWith("http") ? r.website : `https://${r.website}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline truncate block max-w-[140px] flex items-center gap-1">
                            <Globe className="h-3 w-3 shrink-0" />
                            {r.domain || r.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{r.city || "—"}</TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${scoreBadge(r.lead_score)}`}>
                              {r.lead_score}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            <p>Lead Score: {r.lead_score}/100</p>
                            <p>Domain konf.: {r.domain_confidence || 0}%</p>
                            {r.technologies_detected?.length > 0 && (
                              <p>Tech: {r.technologies_detected.join(", ")}</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {r.source_list?.length > 0 ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border border-border">
                                  {r.source_list.length} kilder
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                {r.source_list.join(", ")}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            r.source_page ? (
                              <a href={r.source_page} target="_blank" rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary">
                                <Link2 className="h-3.5 w-3.5" />
                              </a>
                            ) : "—"
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.imported && <Check className="h-4 w-4 text-emerald-400" />}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      )}

      {/* ── SESSIONS HISTORY ────────────────────────────────── */}
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><History className="h-4 w-4" />{t("leadGen.sessionsHistory")}</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="p-0 mt-2 overflow-hidden">
            {sessionsQuery.isLoading ? (
              <div className="p-4 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>
            ) : !sessionsQuery.data?.length ? (
              <div className="p-4 text-center text-sm text-muted-foreground">{t("leadGen.noSessions")}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("leadGen.colQuery")}</TableHead>
                    <TableHead>{t("leadGen.colDate")}</TableHead>
                    <TableHead>{t("common.results")}</TableHead>
                    <TableHead>{t("leadGen.colStatus")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessionsQuery.data.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium text-sm">{s.query}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm">{s.results_count}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${statusBadge(s.status)}`}>{s.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => { setActiveSessionId(s.id); setSelectedIds(new Set()); }} className="gap-1">
                          <Eye className="h-3.5 w-3.5" />{t("leadGen.viewResults")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* ── SAVED SEARCHES ──────────────────────────────────── */}
      <Collapsible open={savedOpen} onOpenChange={setSavedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><BookmarkPlus className="h-4 w-4" />{t("leadGen.savedSearches")}</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${savedOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="p-0 mt-2 overflow-hidden">
            {savedQuery.isLoading ? (
              <div className="p-4 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>
            ) : !savedQuery.data?.length ? (
              <div className="p-4 text-center text-sm text-muted-foreground">{t("leadGen.noSavedSearches")}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{t("leadGen.colQuery")}</TableHead>
                    <TableHead>{t("leadGen.colDate")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {savedQuery.data.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium text-sm">{s.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.query}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { loadSavedSearch(s); toast.success(t("leadGen.searchLoaded")); }} className="gap-1">
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteSaved.mutate(s.id)} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Folder picker dialog for import */}
      <Dialog open={importFolderDialogOpen} onOpenChange={setImportFolderDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("leadGen.importToFolder") || "Import to folder"}</DialogTitle>
            <DialogDescription>
              {t("leadGen.importToFolderDesc") || `Select a folder to import ${importMode === "all" ? "all" : selectedIds.size} leads to.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Select value={importFolderId} onValueChange={setImportFolderId}>
              <SelectTrigger><SelectValue placeholder={t("leadGen.selectFolder") || "Select folder"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("leadGen.noFolder") || "No folder"}</SelectItem>
                {(folders ?? []).map((f: LeadFolder) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="flex items-center gap-1.5">
                      <FolderOpen className="h-3.5 w-3.5" style={{ color: f.color }} />{f.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={t("pages.leads.folderNamePlaceholder") || "New folder..."} className="h-9 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newFolderName.trim()) {
                    createFolder.mutate({ name: newFolderName.trim() }, {
                      onSuccess: (data) => { setImportFolderId(data.id); setNewFolderName(""); toast.success(t('pages.leads.folderCreated')); },
                      onError: (err) => toast.error(err.message),
                    });
                  }
                }}
              />
              <Button size="sm" variant="outline" disabled={!newFolderName.trim() || createFolder.isPending}
                onClick={() => {
                  if (!newFolderName.trim()) return;
                  createFolder.mutate({ name: newFolderName.trim() }, {
                    onSuccess: (data) => { setImportFolderId(data.id); setNewFolderName(""); toast.success(t('pages.leads.folderCreated')); },
                    onError: (err) => toast.error(err.message),
                  });
                }} className="gap-1.5">
                <FolderPlus className="h-3.5 w-3.5" />{t("common.create") || "Add"}
              </Button>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setImportFolderDialogOpen(false)}>{t("common.cancel")}</Button>
              <Button className="flex-1 gap-1.5" onClick={confirmImport} disabled={importResults.isPending}>
                {importResults.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {t("leadGen.importCta") || "Import"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
