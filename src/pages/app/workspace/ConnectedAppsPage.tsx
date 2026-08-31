import { useEffect, useMemo, useState } from "react";
import {
  Mail, Calendar, MessagesSquare, CreditCard, FileText, Phone, BarChart3,
  Cloud, CheckCircle2, Sparkles, Search, Github, Linkedin, Loader2,
  Database, Webhook, Zap, ExternalLink, Bot, Workflow, Puzzle,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  useIntegrations, useDisconnectIntegration, useConnectWebhook,
  useComposioToolkits, useCreateComposioConnection, useDisconnectComposioConnection,
  useSyncComposioConnection,
  type Integration,
} from "@/hooks/api/useIntegrations";
import { AiClientsPanel } from "@/components/workspace/AiClientsPanel";

type Category = "Communication" | "Calendar" | "Finance" | "Data" | "Developer" | "Marketing" | "AI" | "Automation" | "Other";

interface Catalog {
  provider: string;
  name: string;
  surface: string;
  icon: LucideIcon;
  category: Category;
  hint?: string;
}

function AppLogo({ logoUrl, icon: Icon, className }: { logoUrl?: string; icon: LucideIcon; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return <img src={logoUrl} alt="" className={className ?? "h-4 w-4 object-contain"} onError={() => setFailed(true)} />;
  }
  return <Icon className={className ?? "h-4 w-4 text-foreground/80"} />;
}

const CATEGORY_LABELS_DA: Record<Catalog["category"], string> = {
  Communication: "Kommunikation",
  Calendar: "Kalender",
  Finance: "Finans",
  Data: "Data",
  Developer: "Udvikler",
  Marketing: "Marketing",
  AI: "AI",
  Automation: "Automatisering",
  Other: "Alle andre integrationer",
};

const catalog: Catalog[] = [
  { provider: "gmail",      name: "Gmail",            surface: "Indbakke · Email · Tråde",            icon: Mail,          category: "Communication", hint: "Zapier: New Email → Webhook" },
  { provider: "outlook",    name: "Outlook",          surface: "Mail · Kalender",                     icon: Mail,          category: "Communication", hint: "Make: Outlook → HTTP" },
  { provider: "slack",      name: "Slack",            surface: "Beskeder · Notifikationer",           icon: MessagesSquare, category: "Communication", hint: "Slack Incoming Webhook URL" },
  { provider: "googlecalendar", name: "Google Calendar",  surface: "Møder · Booking",                icon: Calendar,      category: "Calendar",      hint: "n8n: Google Calendar Trigger" },
  { provider: "stripe",     name: "Stripe",           surface: "Payments · Subscriptions",            icon: CreditCard,    category: "Finance",       hint: "Stripe → Make → Webhook" },
  { provider: "hubspot",    name: "HubSpot",          surface: "CRM sync · Leads",                    icon: Database,      category: "Data",          hint: "HubSpot Workflow → Webhook" },
  { provider: "notion",     name: "Notion",           surface: "Dokumenter · Klient-noter",           icon: FileText,      category: "Data",          hint: "Notion → Make → Webhook" },
  { provider: "github",     name: "GitHub",           surface: "Issues · Releases",                   icon: Github,        category: "Developer",     hint: "GitHub Webhook (repo settings)" },
  { provider: "linkedin",   name: "LinkedIn",         surface: "Outreach · Berigelse",                icon: Linkedin,      category: "Marketing",     hint: "Phantombuster → Webhook" },
  { provider: "twilio",     name: "Twilio",           surface: "Voice · SMS",                         icon: Phone,         category: "Communication", hint: "Twilio Studio → HTTP" },
  { provider: "metaads",    name: "Meta Ads",         surface: "Kampagner · Lead Ads",                icon: BarChart3,     category: "Marketing",     hint: "Meta Lead Ads → Zapier" },
  { provider: "googledrive", name: "Google Drive",    surface: "Filer · Klient-data",                 icon: Cloud,         category: "Data",          hint: "Drive Trigger → Webhook" },
  { provider: "claude",     name: "Claude",           surface: "AI handlinger via webhook",           icon: Bot,           category: "AI",            hint: "Self-hosted Claude proxy URL" },
  { provider: "openai",     name: "ChatGPT",          surface: "AI handlinger via webhook",           icon: Bot,           category: "AI",            hint: "Self-hosted OpenAI proxy URL" },
  { provider: "n8n",        name: "n8n",              surface: "Self-hosted workflows",               icon: Workflow,      category: "Automation",    hint: "n8n Webhook node URL" },
  { provider: "activepieces", name: "Activepieces",   surface: "Open-source automation",              icon: Workflow,      category: "Automation",    hint: "Activepieces Webhook trigger" },
  { provider: "zapier",     name: "Zapier",           surface: "Universal bro",                       icon: Zap,           category: "Automation",    hint: "Zapier Catch Hook URL" },
  { provider: "make",       name: "Make",             surface: "Universal bro",                       icon: Zap,           category: "Automation",    hint: "Make Webhook URL" },
];

export default function ConnectedAppsPage() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Catalog | null>(null);
  const { data: integrations = [], isLoading } = useIntegrations();
  const disconnect = useDisconnectIntegration();
  const disconnectComposio = useDisconnectComposioConnection();
  const syncComposio = useSyncComposioConnection();

  // On return from a Composio OAuth redirect (or just periodically on load),
  // resolve any connection this tenant left "pending" to its real status.
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
  // copy/icon/category; every other real toolkit Composio supports gets a
  // generic entry so it's still searchable and connectable via real OAuth.
  const curatedProviders = useMemo(() => new Set(catalog.map(c => c.provider)), []);
  const composioBySlug = useMemo(
    () => new Map((toolkitsData?.toolkits ?? []).map(t => [t.slug, t])),
    [toolkitsData],
  );
  const composioSlugs = useMemo(() => new Set(composioBySlug.keys()), [composioBySlug]);
  const oauthCapableSlugs = useMemo(
    () => new Set([...composioBySlug.values()].filter(t => t.composio_managed_auth_schemes?.includes("OAUTH2")).map(t => t.slug)),
    [composioBySlug],
  );
  const fullCatalog = useMemo(() => {
    const live: Catalog[] = (toolkitsData?.toolkits ?? [])
      .filter(t => !curatedProviders.has(t.slug))
      .map(t => ({
        provider: t.slug,
        name: t.name,
        surface: t.meta?.description?.slice(0, 60) ?? "Composio-integration",
        icon: Puzzle,
        category: "Other" as const,
      }));
    return [...catalog, ...live];
  }, [toolkitsData, curatedProviders]);

  const filtered = useMemo(
    () => fullCatalog.filter(a => a.name.toLowerCase().includes(q.toLowerCase()) || a.surface.toLowerCase().includes(q.toLowerCase())),
    [q, fullCatalog]
  );

  const liveCount = integrations.filter(i => i.status === "connected").length;
  const grouped = useMemo(() => {
    const m = new Map<string, Catalog[]>();
    filtered.forEach(a => m.set(a.category, [...(m.get(a.category) ?? []), a]));
    return Array.from(m.entries());
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
              Log ind med jeres rigtige konto — vi henter og opdaterer data direkte, ingen manuel opsætning.
              For systemer uden direkte login kan I stadig bruge en webhook-bro (Zapier, Make, n8n, Activepieces).
            </p>
          </div>
          <div className="flex items-center gap-8 text-sm">
            <Pulse value={liveCount} label="Live forbindelser" />
            <Pulse value={fullCatalog.length - liveCount} label="Tilgængelige" muted />
            <Pulse value={fullCatalog.length} label={toolkitsLoading ? "Henter…" : "I kataloget"} muted />
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
                hasComposioOAuth={oauthCapableSlugs.has(c.provider)}
                logoUrl={composioBySlug.get(c.provider)?.meta?.logo}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="border-t border-border/40 pt-12">
        <AiClientsPanel />
      </div>

      <footer className="border-t border-border/40 pt-8 flex items-start gap-3 text-sm text-muted-foreground max-w-3xl">
        <Sparkles className="h-4 w-4 mt-0.5 text-primary/70 shrink-0" />
        <p className="leading-relaxed">
          Workflows og AI-actions affyrer disse webhooks automatisk. Skift backend (Zapier → n8n → Activepieces) uden at ændre workspacet — kontrakten er den samme HTTPS POST.
        </p>
      </footer>

      <ConnectDialog
        item={active}
        existing={active ? byProvider.get(active.provider) : undefined}
        onClose={() => setActive(null)}
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
  catalog: c, integration, onConnect, onDisconnect, hasComposioOAuth, logoUrl,
}: {
  catalog: Catalog; integration?: Integration;
  onConnect: () => void; onDisconnect: () => void; hasComposioOAuth: boolean; logoUrl?: string;
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
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onConnect}>
            {hasComposioOAuth ? "Forbind" : "Forbind via webhook"}
          </Button>
        )}
      </div>
    </div>
  );
}


function ConnectDialog({
  item, existing, onClose,
}: { item: Catalog | null; existing?: Integration; onClose: () => void }) {
  const connect = useConnectWebhook();
  const { data: toolkitsData } = useComposioToolkits();
  const createComposioConnection = useCreateComposioConnection();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [showWebhookFallback, setShowWebhookFallback] = useState(false);

  // Reset on item change
  useMemo(() => {
    setUrl((existing?.metadata as { webhook_url?: string } | undefined)?.webhook_url ?? "");
    setLabel(existing?.account_label ?? "");
  }, [item?.provider, existing?.id]);

  if (!item) return null;
  const composioToolkitAny = toolkitsData?.toolkits.find((t) => t.slug === item.provider);
  const composioToolkit = composioToolkitAny?.composio_managed_auth_schemes?.includes("OAUTH2") ? composioToolkitAny : undefined;

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-lg border border-border/50 bg-card flex items-center justify-center">
              <AppLogo logoUrl={composioToolkitAny?.meta?.logo} icon={item.icon} />
            </div>
            <div>
              <DialogTitle>Forbind {item.name}</DialogTitle>
              <DialogDescription className="text-xs">{item.surface}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {composioToolkit && !showWebhookFallback ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground leading-relaxed">
                <div className="flex items-center gap-1.5 text-foreground/80 mb-1">
                  <CheckCircle2 className="h-3 w-3" /> Rigtig konto-forbindelse
                </div>
                Log ind med jeres {item.name}-konto — vi henter og opdaterer data direkte, ingen manuel webhook nødvendig.
              </div>
              <Button
                className="w-full gap-2"
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
              <button
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                onClick={() => setShowWebhookFallback(true)}
              >
                Brug webhook i stedet (avanceret)
              </button>
            </div>
          ) : (
          <>
          <div className="rounded-lg border border-border/40 bg-card/30 p-3 text-xs text-muted-foreground leading-relaxed">
            <div className="flex items-center gap-1.5 text-foreground/80 mb-1">
              <Webhook className="h-3 w-3" /> Open-source bro
            </div>
            Indsæt en webhook-URL fra <strong>Zapier (Catch Hook)</strong>, <strong>Make</strong>, <strong>n8n</strong> eller <strong>Activepieces</strong>.
            Workspace sender JSON-events hertil — ingen API-nøgler kræves.
            {item.hint && <div className="mt-1.5 text-foreground/60">Tip: {item.hint}</div>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="wh-url" className="text-xs">Webhook URL</Label>
            <Input
              id="wh-url"
              placeholder="https://hooks.zapier.com/hooks/catch/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wh-label" className="text-xs">Konto-navn (valgfrit)</Label>
            <Input
              id="wh-label"
              placeholder={`fx ${item.name} – produktion`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <a
            href="https://zapier.com/apps/webhook/help"
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" /> Sådan laver du en Catch Hook
          </a>
          </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annullér</Button>
          {(!composioToolkit || showWebhookFallback) && (
            <Button
              onClick={() =>
                connect.mutate(
                  { provider: item.provider, name: item.name, webhookUrl: url.trim(), accountLabel: label.trim() || undefined },
                  { onSuccess: () => onClose() }
                )
              }
              disabled={!url.trim() || connect.isPending}
            >
              {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Forbind
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
