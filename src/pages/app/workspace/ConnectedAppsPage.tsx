import { useEffect, useMemo, useState } from "react";
import {
  Mail, Calendar, MessagesSquare, CreditCard, FileText, BarChart3,
  Cloud, CheckCircle2, Sparkles, Search, Github, Linkedin, Loader2,
  Database, ExternalLink, Puzzle, Lock, ChevronDown, ChevronRight, ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  useIntegrations, useDisconnectIntegration,
  useComposioToolkits, useCreateComposioConnection, useDisconnectComposioConnection,
  useSyncComposioConnection, useModuleAvailability,
  type Integration,
} from "@/hooks/api/useIntegrations";
import {
  useIntegrationDNA, useIntegrationOpportunities, useDismissOpportunity, useActivateOpportunity,
  type IntegrationOpportunity,
} from "@/hooks/api/useIntegrationDNA";
import { AiClientsPanel } from "@/components/workspace/AiClientsPanel";
import { isLocale } from "@/lib/i18n";

const OPPORTUNITY_TYPE_LABELS: Record<IntegrationOpportunity["type"], string> = {
  READY_NOW: "Klar nu",
  ONE_CONNECTION_AWAY: "Én forbindelse væk",
  UNUSED_CAPABILITY: "Ubrugt kapabilitet",
  CROSS_MODULE: "På tværs af moduler",
  WORKFLOW_COMBINATION: "Kombination",
  REDUNDANCY: "Overlap",
  BROKEN_CHAIN: "Manglende led",
};

function IntegrationDNAPanel() {
  const { data: dna, isLoading: dnaLoading } = useIntegrationDNA();
  const { data: opportunities = [], isLoading: oppsLoading } = useIntegrationOpportunities();
  const dismiss = useDismissOpportunity();
  const activate = useActivateOpportunity();

  if (dnaLoading || !dna) {
    return (
      <section className="rounded-xl border border-border/40 bg-card/20 p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Beregner jeres Integration DNA…
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">Jeres Integration DNA</div>
      <div className="rounded-xl border border-border/40 bg-card/20 p-6 space-y-6">
        <div className="flex items-center gap-8 flex-wrap">
          <div>
            <div className="text-4xl font-semibold tracking-tight font-display">{dna.score}%</div>
            <div className="text-xs text-muted-foreground mt-1">Integration DNA-score</div>
          </div>
          <div className="flex gap-6 text-sm">
            <Pulse value={dna.connected_count} label="Forbundne systemer" />
            <Pulse value={dna.capability_count} label="Kapabiliteter" />
            <Pulse value={dna.used_capability_count} label="I brug" />
            <Pulse value={dna.unused_capability_count} label="Ubrugte" muted />
            {dna.broken_chain_count > 0 && <Pulse value={dna.broken_chain_count} label="Manglende led" />}
            {dna.needs_attention_count > 0 && <Pulse value={dna.needs_attention_count} label="Kræver opmærksomhed" />}
          </div>
        </div>

        {oppsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Henter muligheder…
          </div>
        ) : opportunities.length === 0 ? (
          <div className="text-sm text-muted-foreground">Ingen nye muligheder lige nu — forbind flere systemer for at låse mere op.</div>
        ) : (
          <div className="space-y-3">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">
              Topmuligheder ({opportunities.length})
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {opportunities.map((opp) => (
                <div key={opp.id} className="rounded-lg border border-border/40 bg-background/40 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wide text-primary/80">
                      {OPPORTUNITY_TYPE_LABELS[opp.type]}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{Math.round(opp.confidence * 100)}% sikker</span>
                  </div>
                  <div className="font-medium text-sm">{opp.title}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{opp.description}</p>
                  <p className="text-[11px] text-muted-foreground/70 italic">{opp.reason}</p>
                  {opp.impacted_modules.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {opp.impacted_modules.map((m) => (
                        <span key={m} className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{m}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    {opp.type === "READY_NOW" || opp.type === "UNUSED_CAPABILITY" ? (
                      <Button size="sm" variant="secondary" onClick={() => activate.mutate(opp.id)} disabled={activate.isPending}>
                        Aktivér
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => dismiss.mutate(opp.id)} disabled={dismiss.isPending}>
                      Afvis
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// Topic buckets tailored to this app's own modules (CRM, Marketing, Finance,
// HR, workspace tools) so the same grouping the user already thinks in
// (Marketing, Salg, Finans, …) is what they see here — not Composio's raw,
// much finer-grained category list.
type Category =
  | "Marketing" | "Sales" | "Communication" | "Calendar" | "Finance"
  | "Documents" | "Data" | "Ecommerce" | "HR" | "Developer" | "AI"
  | "Productivity" | "Support" | "Other";

interface Catalog {
  provider: string;
  name: string;
  surface: string;
  icon: LucideIcon;
  category: Category;
}

function AppLogo({ logoUrl, icon: Icon, className }: { logoUrl?: string; icon: LucideIcon; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return <img src={logoUrl} alt="" className={className ?? "h-4 w-4 object-contain"} onError={() => setFailed(true)} />;
  }
  return <Icon className={className ?? "h-4 w-4 text-foreground/80"} />;
}

const CATEGORY_LABELS_DA: Record<Category, string> = {
  Marketing: "Marketing",
  Sales: "Salg & CRM",
  Communication: "Kommunikation",
  Calendar: "Kalender & booking",
  Finance: "Finans & betaling",
  Documents: "Dokumenter & filer",
  Data: "Data & analyse",
  Ecommerce: "E-handel",
  HR: "HR",
  Developer: "Udvikler",
  AI: "AI",
  Productivity: "Produktivitet & projekter",
  Support: "Support",
  Other: "Andre integrationer",
};

// Category display order — the topics most relevant to this CRM's own
// modules come first, the long tail ("Other") always last.
const CATEGORY_ORDER: Category[] = [
  "Marketing", "Sales", "Communication", "Calendar", "Finance", "Ecommerce",
  "Documents", "Data", "HR", "Productivity", "AI", "Developer", "Support", "Other",
];

// Maps Composio's own (much finer-grained) toolkit categories onto our
// topic buckets. Anything not listed here falls into "Other" — safe by
// construction, no toolkit is ever dropped, just under-categorized.
const COMPOSIO_CATEGORY_MAP: Record<string, Category> = {
  "marketing": "Marketing",
  "marketing automation": "Marketing",
  "social media marketing": "Marketing",
  "social media accounts": "Marketing",
  "ads & conversion": "Marketing",
  "email newsletters": "Marketing",
  "drip emails": "Marketing",
  "forms & surveys": "Marketing",
  "event management": "Marketing",

  "crm": "Sales",
  "sales & crm": "Sales",
  "contact management": "Sales",
  "ai sales tools": "Sales",

  "email": "Communication",
  "team chat": "Communication",
  "communication": "Communication",
  "video conferencing": "Communication",
  "transactional email": "Communication",
  "phone & sms": "Communication",
  "notifications": "Communication",

  "scheduling & booking": "Calendar",
  "calendar": "Calendar",

  "payment processing": "Finance",
  "accounting": "Finance",
  "fundraising": "Finance",

  "ecommerce": "Ecommerce",
  "commerce": "Ecommerce",

  "documents": "Documents",
  "notes": "Documents",
  "spreadsheets": "Documents",
  "file management & storage": "Documents",
  "signatures": "Documents",
  "content & files": "Documents",

  "analytics": "Data",
  "business intelligence": "Data",
  "databases": "Data",
  "dashboards": "Data",

  "human resources": "HR",
  "hr talent & recruitment": "HR",
  "time tracking software": "HR",

  "developer tools": "Developer",
  "security & identity tools": "Developer",
  "it operations": "Developer",
  "server monitoring": "Developer",
  "website builders": "Developer",
  "app builder": "Developer",
  "model context protocol": "Developer",
  "internet of things": "Developer",

  "artificial intelligence": "AI",
  "ai agents": "AI",
  "ai assistants": "AI",
  "ai chatbots": "AI",
  "ai content generation": "AI",
  "ai document extraction": "AI",
  "ai meeting assistants": "AI",
  "ai models": "AI",
  "ai safety compliance detection": "AI",
  "ai web scraping": "AI",

  "productivity": "Productivity",
  "project management": "Productivity",
  "task management": "Productivity",
  "team collaboration": "Productivity",
  "product management": "Productivity",
  "bookmark managers": "Productivity",

  "customer support": "Support",
  "customer appreciation": "Support",
};

function categoryFromComposio(t: { meta?: { categories?: Array<{ name: string }> } }): Category {
  const primary = t.meta?.categories?.[0]?.name?.toLowerCase();
  if (primary && COMPOSIO_CATEGORY_MAP[primary]) return COMPOSIO_CATEGORY_MAP[primary];
  return "Other";
}

// Hand-curated entries only exist to give the most common apps nicer
// Danish copy and a lucide fallback icon — everything else (still real,
// still connectable) is generated straight from Composio's own catalog
// further down.
// The honest split this page is built around: a handful of connections
// actually power something in the app today (checked live against a real
// consuming page), everything else is a real, working connection that
// simply isn't wired to a feature yet. Featuring only what's proven here
// is what stops "connect Gmail, expect Calendar to fill up" — each entry
// names exactly which provider(s) satisfy it and where the result shows up.
interface LiveModule {
  module: string;
  title: string;
  outcome: string;
  providers: string[]; // any one of these connected + active satisfies it
  pageLink: string; // relative to /:locale/app/
  icon: LucideIcon;
}

const LIVE_MODULES: LiveModule[] = [
  {
    module: "calendar",
    title: "Kalender",
    outcome: "Jeres møder fra Google Calendar eller Outlook vises automatisk på Kalender-siden.",
    providers: ["googlecalendar", "outlook"],
    pageLink: "work/calendar",
    icon: Calendar,
  },
  {
    module: "documents",
    title: "Dokumenter",
    outcome: "Jeres sider fra Notion vises automatisk på Dokumenter-siden.",
    providers: ["notion"],
    pageLink: "workspace/documents",
    icon: FileText,
  },
];

// Only integrations that actually power something in this app once
// connected — every entry here must be traceable to a real downstream
// consumer (a LIVE_MODULES entry, or a dedicated feature). Previously this
// list also included Stripe, HubSpot, Pipedrive, Google Drive, GitHub,
// LinkedIn, Shopify, Slack, and a second "Meta Ads" entry that duplicated
// the real one in Marketing → Meta Ads — none of those had any code
// reading the connection they created, so "Connected" was a dead end.
// Meta Ads has its own dedicated OAuth flow (MetaAccountConnection.tsx,
// meta_connections table) — it belongs in Marketing, not here.
const catalog: Catalog[] = [
  { provider: "gmail",          name: "Gmail",           surface: "Indbakke · Email · Afsendelse", icon: Mail,     category: "Communication" },
  { provider: "outlook",        name: "Outlook",         surface: "Kalender",                       icon: Mail,     category: "Communication" },
  { provider: "googlecalendar", name: "Google Calendar", surface: "Møder · Booking",                icon: Calendar, category: "Calendar" },
  { provider: "notion",         name: "Notion",          surface: "Dokumenter · Klient-noter",      icon: FileText, category: "Documents" },
];

export default function ConnectedAppsPage() {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Catalog | null>(null);
  // Full categorized catalog visible by default — it was previously
  // collapsed behind a click, which made it look like all non-"active
  // module" integrations had disappeared. The category list is the
  // primary way users discover and connect anything beyond the handful
  // of curated modules above it.
  const [showFullCatalog, setShowFullCatalog] = useState(true);
  const { data: integrations = [], isLoading } = useIntegrations();
  const { data: availability } = useModuleAvailability();
  const disconnect = useDisconnectIntegration();
  const disconnectComposio = useDisconnectComposioConnection();
  const syncComposio = useSyncComposioConnection();

  // On return from a Composio connect redirect (or just periodically on
  // load), resolve any connection this tenant left "pending" to its real
  // status.
  useEffect(() => {
    const pending = (integrations as (Integration & { composio_connection_id?: string | null })[]).filter(
      (i) => i.status === "pending" && i.composio_connection_id,
    );
    pending.forEach((i) => syncComposio.mutate(i.composio_connection_id!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrations.length]);
  const { data: toolkitsData, isLoading: toolkitsLoading } = useComposioToolkits();

  const byProvider = useMemo(() => {
    const m = new Map<string, Integration>();
    integrations.forEach(i => m.set(i.provider, i));
    return m;
  }, [integrations]);

  // Every real Composio toolkit belongs in this catalog, not just the
  // hand-curated set — toolkits already listed above keep their nicer DA
  // copy/icon; every other real toolkit Composio supports gets a generic
  // entry, categorized from Composio's own metadata, so it's still
  // searchable and connectable via a real login/API key — never a webhook.
  const curatedProviders = useMemo(() => new Set(catalog.map(c => c.provider)), []);
  const composioBySlug = useMemo(
    () => new Map((toolkitsData?.toolkits ?? []).map(t => [t.slug, t])),
    [toolkitsData],
  );
  const connectableSlugs = useMemo(
    () => new Set([...composioBySlug.values()].filter(t => t.connectable).map(t => t.slug)),
    [composioBySlug],
  );
  // The long tail of every other toolkit Composio supports (often 100+,
  // most irrelevant to a Danish B2B CRM) is real and connectable, but
  // showing it by default is exactly what made the catalog feel random —
  // none of them power a specific feature the way the curated set does.
  // Only surface it when someone explicitly searches for something.
  const fullCatalog = useMemo(() => {
    const live: Catalog[] = (toolkitsData?.toolkits ?? [])
      .filter(t => !curatedProviders.has(t.slug))
      .map(t => ({
        provider: t.slug,
        name: t.name,
        surface: t.meta?.description?.slice(0, 60) ?? "Composio-integration",
        icon: Puzzle,
        category: categoryFromComposio(t),
      }));
    return [...catalog, ...live];
  }, [toolkitsData, curatedProviders]);

  const browsable = q.trim() ? fullCatalog : catalog;
  const filtered = useMemo(
    () => browsable.filter(a => a.name.toLowerCase().includes(q.toLowerCase()) || a.surface.toLowerCase().includes(q.toLowerCase())),
    [q, browsable]
  );

  const liveCount = integrations.filter(i => i.status === "connected").length;
  const grouped = useMemo(() => {
    const m = new Map<Category, Catalog[]>();
    filtered.forEach(a => m.set(a.category, [...(m.get(a.category) ?? []), a]));
    return CATEGORY_ORDER.filter(cat => m.has(cat)).map(cat => [cat, m.get(cat)!] as const);
  }, [filtered]);

  return (
    <div className="space-y-14 pb-20">
      <header className="space-y-6">
        <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-muted-foreground/50">
          Workspace · Integrationslag
        </div>
        <div className="flex items-end justify-between gap-8 flex-wrap">
          <div className="space-y-3 max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-tight font-display">
              Forbundne apps
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed">
              To ting herunder gør faktisk noget lige nu — Kalender og Dokumenter — resten af kataloget kan I forbinde,
              men det er ikke koblet til en funktion i CRM'et endnu.
            </p>
          </div>
          <div className="flex items-center gap-8 text-sm">
            <Pulse value={liveCount} label="Live forbindelser" />
            <Pulse value={catalog.length - liveCount} label="Tilgængelige" muted />
            <Pulse value={fullCatalog.length - catalog.length} label={toolkitsLoading ? "Henter…" : "Flere via søgning"} muted />
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            placeholder="Søg systemer, signaler, datakilder…"
            value={q} onChange={(e) => setQ(e.target.value)}
            className="pl-9 bg-card/40 border-border/40 focus-visible:ring-1 focus-visible:ring-primary/40"
          />
        </div>
      </header>

      <IntegrationDNAPanel />

      <section className="space-y-3">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">Aktive moduler</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {LIVE_MODULES.map((m) => {
            const modAvail = availability?.modules.find((x) => x.module === m.module);
            const isOn = !!modAvail?.available;
            const activeProvider = modAvail?.resolvedConnections[0]?.provider;
            const connectTarget = catalog.find((c) => c.provider === m.providers[0]);
            return (
              <div key={m.module} className={`rounded-xl border p-4 space-y-3 ${isOn ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/40 bg-card/20"}`}>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg border border-border/40 bg-card/50 flex items-center justify-center shrink-0">
                    <m.icon className="h-4 w-4 text-foreground/80" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{m.title}</span>
                      {isOn ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500"><CheckCircle2 className="h-3 w-3" /> Aktiv via {activeProvider}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Ikke forbundet</span>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{m.outcome}</p>
                {isOn ? (
                  <Link to={`/${locale}/app/${m.pageLink}`} className="inline-flex items-center gap-1 text-xs text-emerald-500 hover:underline">
                    Gå til {m.title} <ArrowRight className="h-3 w-3" />
                  </Link>
                ) : (
                  connectTarget && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setActive(connectTarget)}>
                      Forbind {connectTarget.name}
                    </Button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </section>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Henter forbindelser…
        </div>
      )}

      {!q && integrations.some(i => i.status === "connected") && (
        <section className="space-y-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">Installeret</div>
          <div className="flex flex-wrap gap-2">
            {integrations.filter(i => i.status === "connected").map(i => {
              const c = fullCatalog.find(x => x.provider === i.provider);
              if (!c) return null;
              return (
                <button
                  key={i.id}
                  onClick={() => setActive(c)}
                  title={c.name}
                  className="h-10 w-10 rounded-lg border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-center hover:border-emerald-500/60 transition-colors"
                >
                  <AppLogo logoUrl={composioBySlug.get(c.provider)?.meta?.logo} icon={c.icon} className="h-4 w-4 object-contain" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {!q && !showFullCatalog ? (
        <button
          onClick={() => setShowFullCatalog(true)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full justify-between rounded-xl border border-border/30 px-4 py-3 transition-colors"
        >
          <span>Vis resten af kataloget ({fullCatalog.length - LIVE_MODULES.reduce((n, m) => n + m.providers.length, 0)} apps, endnu ikke koblet til en funktion)</span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </button>
      ) : (
        <>
          {!q && (
            <button
              onClick={() => setShowFullCatalog(false)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground -mb-6"
            >
              <ChevronDown className="h-3.5 w-3.5" /> Skjul katalog
            </button>
          )}
          {grouped.map(([cat, items]) => (
            <section key={cat} className="space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 mb-3">{CATEGORY_LABELS_DA[cat]}</div>
              <div className="divide-y divide-border/30 rounded-xl border border-border/30 overflow-hidden">
                {items.map((c) => (
                  <AppRow
                    key={c.provider}
                    catalog={c}
                    integration={byProvider.get(c.provider)}
                    onConnect={() => setActive(c)}
                    onDisconnect={() => {
                      const existing = byProvider.get(c.provider);
                      if (!existing) return;
                      if ((existing as Integration & { composio_connection_id?: string | null }).composio_connection_id) {
                        disconnectComposio.mutate(existing.id);
                      } else {
                        disconnect.mutate(existing.id);
                      }
                    }}
                    canConnect={connectableSlugs.has(c.provider)}
                    logoUrl={composioBySlug.get(c.provider)?.meta?.logo}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      <div className="border-t border-border/40 pt-12">
        <AiClientsPanel />
      </div>

      <footer className="border-t border-border/40 pt-8 flex items-start gap-3 text-sm text-muted-foreground max-w-3xl">
        <Sparkles className="h-4 w-4 mt-0.5 text-primary/70 shrink-0" />
        <p className="leading-relaxed">
          Workflows og AI-actions bruger jeres forbundne konti direkte — ingen separate API-nøgler eller webhooks at vedligeholde.
        </p>
      </footer>

      <ConnectDialog
        item={active}
        existing={active ? byProvider.get(active.provider) : undefined}
        canConnect={active ? connectableSlugs.has(active.provider) : false}
        onClose={() => setActive(null)}
        onDisconnect={() => {
          if (!active) return;
          const existing = byProvider.get(active.provider);
          if (!existing) return;
          if ((existing as Integration & { composio_connection_id?: string | null }).composio_connection_id) {
            disconnectComposio.mutate(existing.id);
          } else {
            disconnect.mutate(existing.id);
          }
          setActive(null);
        }}
      />
    </div>
  );
}

function Pulse({ value, label, muted }: { value: number; label: string; muted?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className={`text-2xl font-semibold tabular-nums ${muted ? "text-muted-foreground" : "text-foreground"}`}>{value}</span>
      <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/50">{label}</span>
    </div>
  );
}

function AppRow({
  catalog: c, integration, onConnect, onDisconnect, canConnect, logoUrl,
}: {
  catalog: Catalog; integration?: Integration;
  onConnect: () => void; onDisconnect: () => void; canConnect: boolean; logoUrl?: string;
}) {
  const isConnected = integration?.status === "connected";
  const isPending = integration?.status === "pending";

  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-background hover:bg-card/40 transition-colors">
      <div className="h-9 w-9 rounded-lg border border-border/40 bg-card/50 flex items-center justify-center shrink-0">
        <AppLogo logoUrl={logoUrl} icon={c.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{c.name}</span>
          {isConnected && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {integration?.account_label || c.surface}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {isConnected ? (
          <>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onConnect}>Administrér</Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground hover:text-destructive" onClick={onDisconnect}>
              Afbryd
            </Button>
          </>
        ) : isPending ? (
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onConnect}>
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Afventer
          </Button>
        ) : canConnect ? (
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onConnect}>
            Forbind
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70" title="Kræver jeres egen OAuth-app hos udbyderen">
            <Lock className="h-3 w-3" /> Kræver opsætning
          </span>
        )}
      </div>
    </div>
  );
}


function ConnectDialog({
  item, existing, canConnect, onClose, onDisconnect,
}: { item: Catalog | null; existing?: Integration; canConnect: boolean; onClose: () => void; onDisconnect: () => void }) {
  const { data: toolkitsData } = useComposioToolkits();
  const createComposioConnection = useCreateComposioConnection();

  if (!item) return null;
  const composioToolkit = toolkitsData?.toolkits.find((t) => t.slug === item.provider);
  const isConnected = existing?.status === "connected";
  const isPending = existing?.status === "pending";

  // Already connected (or pending) — this is a status view, never a
  // re-connect trigger. Clicking "Administrér" on an installed app must
  // never redirect anywhere outside the CRM; the only action available
  // here is disconnecting, which stays entirely in-app.
  if (isConnected || isPending) {
    return (
      <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-lg border border-border/50 bg-card flex items-center justify-center">
                <AppLogo logoUrl={composioToolkit?.meta?.logo} icon={item.icon} />
              </div>
              <div>
                <DialogTitle>{item.name}</DialogTitle>
                <DialogDescription className="text-xs">{item.surface}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className={`rounded-lg border p-3 text-xs leading-relaxed ${isConnected ? "border-emerald-500/30 bg-emerald-500/5 text-muted-foreground" : "border-border/40 bg-card/30 text-muted-foreground"}`}>
              <div className={`flex items-center gap-1.5 mb-1 ${isConnected ? "text-emerald-500" : "text-foreground/80"}`}>
                {isConnected ? <CheckCircle2 className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
                {isConnected ? "Forbundet" : "Afventer bekræftelse"}
              </div>
              {isConnected && existing?.connected_at && (
                <span>Forbundet {new Date(existing.connected_at).toLocaleDateString("da-DK")}</span>
              )}
              {isPending && <span>Forbindelsen mangler stadig at blive bekræftet hos {item.name}.</span>}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Luk</Button>
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={onDisconnect}>
              Afbryd forbindelse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-lg border border-border/50 bg-card flex items-center justify-center">
              <AppLogo logoUrl={composioToolkit?.meta?.logo} icon={item.icon} />
            </div>
            <div>
              <DialogTitle>Forbind {item.name}</DialogTitle>
              <DialogDescription className="text-xs">{item.surface}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {canConnect ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground leading-relaxed">
              <div className="flex items-center gap-1.5 text-foreground/80 mb-1">
                <CheckCircle2 className="h-3 w-3" /> Rigtig konto-forbindelse
              </div>
              Log ind med jeres {item.name}-konto. Kræver kontoen en API-nøgle i stedet for login, beder {item.name} selv om den på næste skærm.
              {(() => {
                const poweredModule = LIVE_MODULES.find((m) => m.providers.includes(item.provider));
                return poweredModule ? (
                  <span className="block mt-1.5 text-foreground/70">{poweredModule.outcome}</span>
                ) : (
                  <span className="block mt-1.5 text-amber-500/90">
                    Forbindelsen oprettes med det samme, men bruges endnu ikke af en specifik funktion i CRM'et — I forbinder den til senere brug.
                  </span>
                );
              })()}
            </div>
          ) : (
            <div className="rounded-lg border border-border/40 bg-card/30 p-3 text-xs text-muted-foreground leading-relaxed">
              <div className="flex items-center gap-1.5 text-foreground/80 mb-1">
                <Lock className="h-3 w-3" /> Kræver avanceret opsætning
              </div>
              {item.name} kan ikke forbindes automatisk endnu — denne integration kræver jeres egen OAuth-app registreret hos {item.name}, ikke bare et login.
            </div>
          )}

          {composioToolkit?.meta?.description && (
            <a
              href={`https://mcp.composio.dev/${item.provider}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> Om {item.name}-integrationen
            </a>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annullér</Button>
          {canConnect && (
            <Button
              className="gap-2"
              disabled={createComposioConnection.isPending}
              onClick={() =>
                createComposioConnection.mutate(item.provider, {
                  onSuccess: (res) => { window.location.href = res.redirectUrl; },
                })
              }
            >
              {createComposioConnection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Forbind {item.name}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
