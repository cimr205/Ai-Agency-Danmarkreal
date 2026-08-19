import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Mail, Calendar, MessagesSquare, CreditCard, FileText, Phone, BarChart3,
  Cloud, CheckCircle2, Activity, Sparkles, Search, Github, Linkedin, Loader2,
  Database, Webhook, Zap, ExternalLink, PlayCircle, Bot, Workflow,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  useIntegrations, useDisconnectIntegration, useConnectWebhook, useTestConnection,
  type Integration,
} from "@/hooks/api/useIntegrations";
import { AiClientsPanel } from "@/components/workspace/AiClientsPanel";

interface Catalog {
  provider: string;
  name: string;
  surface: string;
  icon: LucideIcon;
  category: "Communication" | "Calendar" | "Finance" | "Data" | "Developer" | "Marketing" | "AI" | "Automation";
  hint?: string;
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
};

const catalog: Catalog[] = [
  { provider: "gmail",      name: "Gmail",            surface: "Indbakke · Email · Tråde",            icon: Mail,          category: "Communication", hint: "Zapier: New Email → Webhook" },
  { provider: "outlook",    name: "Outlook",          surface: "Mail · Kalender",                     icon: Mail,          category: "Communication", hint: "Make: Outlook → HTTP" },
  { provider: "slack",      name: "Slack",            surface: "Beskeder · Notifikationer",           icon: MessagesSquare, category: "Communication", hint: "Slack Incoming Webhook URL" },
  { provider: "gcal",       name: "Google Calendar",  surface: "Møder · Booking",                     icon: Calendar,      category: "Calendar",      hint: "n8n: Google Calendar Trigger" },
  { provider: "stripe",     name: "Stripe",           surface: "Payments · Subscriptions",            icon: CreditCard,    category: "Finance",       hint: "Stripe → Make → Webhook" },
  { provider: "hubspot",    name: "HubSpot",          surface: "CRM sync · Leads",                    icon: Database,      category: "Data",          hint: "HubSpot Workflow → Webhook" },
  { provider: "notion",     name: "Notion",           surface: "Dokumenter · Klient-noter",           icon: FileText,      category: "Data",          hint: "Notion → Make → Webhook" },
  { provider: "github",     name: "GitHub",           surface: "Issues · Releases",                   icon: Github,        category: "Developer",     hint: "GitHub Webhook (repo settings)" },
  { provider: "linkedin",   name: "LinkedIn",         surface: "Outreach · Berigelse",                icon: Linkedin,      category: "Marketing",     hint: "Phantombuster → Webhook" },
  { provider: "twilio",     name: "Twilio",           surface: "Voice · SMS",                         icon: Phone,         category: "Communication", hint: "Twilio Studio → HTTP" },
  { provider: "meta",       name: "Meta Ads",         surface: "Kampagner · Lead Ads",                icon: BarChart3,     category: "Marketing",     hint: "Meta Lead Ads → Zapier" },
  { provider: "drive",      name: "Google Drive",     surface: "Filer · Klient-data",                 icon: Cloud,         category: "Data",          hint: "Drive Trigger → Webhook" },
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
  const test = useTestConnection();

  const byProvider = useMemo(() => {
    const m = new Map<string, Integration>();
    integrations.forEach(i => m.set(i.provider, i));
    return m;
  }, [integrations]);

  const filtered = useMemo(
    () => catalog.filter(a => a.name.toLowerCase().includes(q.toLowerCase()) || a.surface.toLowerCase().includes(q.toLowerCase())),
    [q]
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
          Workspace · Open-source connector layer
        </div>
        <div className="flex items-end justify-between gap-8 flex-wrap">
          <div className="space-y-3 max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-tight font-display">
              Forbind alt. <span className="text-muted-foreground/60">Uden API-nøgler.</span>
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed">
              Hver tjeneste forbindes via en webhook (Zapier Catch, Make, n8n, Activepieces eller dit eget self-hostede endpoint).
              Ingen OAuth-apps, ingen API-nøgler — ren open-source bro. Workspace forbliver det operationelle lag ovenpå.
            </p>
          </div>
          <div className="flex items-center gap-8 text-sm">
            <Pulse value={liveCount} label="Live forbindelser" />
            <Pulse value={catalog.length - liveCount} label="Tilgængelige" muted />
            <Pulse value={catalog.length} label="I kataloget" muted />
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

      {grouped.map(([cat, items]) => (
        <section key={cat} className="space-y-6">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">{CATEGORY_LABELS_DA[cat]}</div>
          <div className="grid gap-px bg-border/30 rounded-xl overflow-hidden grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {items.map((c, i) => (
              <AppNode
                key={c.provider}
                catalog={c}
                integration={byProvider.get(c.provider)}
                delay={i * 0.04}
                onConnect={() => setActive(c)}
                onDisconnect={() => byProvider.get(c.provider) && disconnect.mutate(byProvider.get(c.provider)!.id)}
                onTest={() => byProvider.get(c.provider) && test.mutate(byProvider.get(c.provider)!)}
                testing={test.isPending}
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

function AppNode({
  catalog: c, integration, delay, onConnect, onDisconnect, onTest, testing,
}: {
  catalog: Catalog; integration?: Integration; delay: number;
  onConnect: () => void; onDisconnect: () => void; onTest: () => void; testing: boolean;
}) {
  const Icon = c.icon;
  const isConnected = integration?.status === "connected";
  const dotClass = isConnected
    ? "bg-emerald-400 shadow-[0_0_12px_hsl(var(--primary)/0.4)]"
    : "bg-foreground/30";
  const stateLabel = isConnected ? "Live" : "Tilgængelig";
  const tone = isConnected ? "text-emerald-300/90" : "text-muted-foreground/70";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="group relative bg-background hover:bg-card/40 transition-colors p-6"
    >
      <div className="flex items-start justify-between mb-5">
        <div className="h-10 w-10 rounded-lg border border-border/40 bg-card/50 flex items-center justify-center group-hover:border-primary/40 transition-colors">
          <Icon className="h-4 w-4 text-foreground/80" />
        </div>
        <div className={`flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] ${tone}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
          {stateLabel}
        </div>
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-medium tracking-tight">{c.name}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{c.surface}</p>
      </div>

      {integration?.account_label && (
        <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          <CheckCircle2 className="h-3 w-3 text-emerald-400/80" />
          {integration.account_label}
        </div>
      )}
      {integration?.last_sync_at && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
          <Activity className="h-3 w-3" /> sidst aktiv {new Date(integration.last_sync_at).toLocaleString("da-DK")}
        </div>
      )}
      {!isConnected && c.hint && (
        <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
          <Webhook className="h-3 w-3" /> {c.hint}
        </div>
      )}

      <div className="mt-5 flex items-center gap-1">
        {isConnected ? (
          <>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onTest} disabled={testing}>
              {testing ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <PlayCircle className="h-3 w-3 mr-1.5" />}
              Test
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onConnect}>
              Redigér
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground hover:text-destructive ml-auto" onClick={onDisconnect}>
              Afbryd
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onConnect}>
            <Webhook className="h-3 w-3 mr-1.5" /> Forbind via webhook
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function ConnectDialog({
  item, existing, onClose,
}: { item: Catalog | null; existing?: Integration; onClose: () => void }) {
  const connect = useConnectWebhook();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");

  // Reset on item change
  useMemo(() => {
    setUrl((existing?.metadata as { webhook_url?: string } | undefined)?.webhook_url ?? "");
    setLabel(existing?.account_label ?? "");
  }, [item?.provider, existing?.id]);

  if (!item) return null;
  const Icon = item.icon;

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-9 w-9 rounded-lg border border-border/50 bg-card flex items-center justify-center">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>Forbind {item.name}</DialogTitle>
              <DialogDescription className="text-xs">{item.surface}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annullér</Button>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
