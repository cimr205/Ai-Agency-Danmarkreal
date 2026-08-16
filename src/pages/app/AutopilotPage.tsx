import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Bot, CheckCircle2, X, Loader2, Sparkles, Send, Zap, Webhook, Mail,
  TrendingUp, FileText, Users, Briefcase, AlertCircle, Inbox,
  type LucideIcon,
} from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  useAutopilotActions, useExecuteAction, useUpdateActionStatus, useWorkspaceEvents,
  type AutopilotAction, type WorkspaceEvent,
} from "@/hooks/api/useAutopilot";
import { cn } from "@/lib/utils";

const AGENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/autopilot-agent`;

export default function AutopilotPage() {
  const { profile, user } = useAuth();
  const events = useWorkspaceEvents();
  const actions = useAutopilotActions();

  const proposed = useMemo(
    () => (actions.data ?? []).filter((a) => a.status === "proposed"),
    [actions.data],
  );

  return (
    <div className="space-y-6 pb-20">
      <Header proposedCount={proposed.length} eventCount={events.data?.length ?? 0} />

      {/* Desktop cockpit */}
      <div className="hidden lg:grid lg:grid-cols-[320px_1fr_360px] gap-px bg-border/30 rounded-xl overflow-hidden h-[calc(100vh-220px)] min-h-[600px]">
        <div className="bg-background overflow-hidden flex flex-col">
          <SectionHeader icon={Activity} label="Live signaler" count={events.data?.length} />
          <SignalFeed events={events.data ?? []} loading={events.isLoading} />
        </div>
        <div className="bg-background overflow-hidden flex flex-col">
          <SectionHeader icon={Bot} label="Autopilot agent" />
          <AgentChat companyId={profile?.company_id ?? null} userId={user?.id ?? null} />
        </div>
        <div className="bg-background overflow-hidden flex flex-col">
          <SectionHeader icon={Zap} label="Action queue" count={proposed.length} accent />
          <ActionQueue actions={actions.data ?? []} loading={actions.isLoading} />
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="lg:hidden">
        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="signals">Signaler</TabsTrigger>
            <TabsTrigger value="chat">Agent</TabsTrigger>
            <TabsTrigger value="queue">Queue {proposed.length > 0 && <span className="ml-1 text-primary">·{proposed.length}</span>}</TabsTrigger>
          </TabsList>
          <TabsContent value="signals" className="mt-4 rounded-xl border border-border/40 h-[60vh] overflow-hidden flex flex-col">
            <SignalFeed events={events.data ?? []} loading={events.isLoading} />
          </TabsContent>
          <TabsContent value="chat" className="mt-4 rounded-xl border border-border/40 h-[60vh] overflow-hidden flex flex-col">
            <AgentChat companyId={profile?.company_id ?? null} userId={user?.id ?? null} />
          </TabsContent>
          <TabsContent value="queue" className="mt-4 rounded-xl border border-border/40 h-[60vh] overflow-hidden flex flex-col">
            <ActionQueue actions={actions.data ?? []} loading={actions.isLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Header({ proposedCount, eventCount }: { proposedCount: number; eventCount: number }) {
  return (
    <header className="space-y-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-muted-foreground/50">
        Autopilot · Cockpit
      </div>
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div className="space-y-2 max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight font-display">
            Drift hele forretningen <span className="text-muted-foreground/60">fra ét sted.</span>
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Signaler fra CRM, finans, produktivitet og integrationer streamer ind live.
            Agenten ser alt, foreslår handlinger, og udfører rutinearbejdet.
            Eksterne handlinger venter på dit ét-klik approve.
          </p>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <Stat value={eventCount} label="Signaler" />
          <Stat value={proposedCount} label="Venter approve" highlight={proposedCount > 0} />
        </div>
      </div>
    </header>
  );
}

function Stat({ value, label, highlight }: { value: number; label: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className={cn("text-2xl font-semibold tabular-nums", highlight ? "text-primary" : "text-foreground")}>{value}</span>
      <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/50">{label}</span>
    </div>
  );
}

function SectionHeader({ icon: Icon, label, count, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; count?: number; accent?: boolean }) {
  return (
    <div className="px-4 h-11 border-b border-border/40 flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground/70 bg-card/30 shrink-0">
      <Icon className={cn("h-3.5 w-3.5", accent && "text-primary")} />
      <span>{label}</span>
      {typeof count === "number" && count > 0 && (
        <span className={cn("ml-auto px-1.5 py-0.5 rounded text-[10px]", accent ? "bg-primary/15 text-primary" : "bg-foreground/5 text-foreground/70")}>
          {count}
        </span>
      )}
    </div>
  );
}

// ─── SIGNAL FEED ──────────────────────────────────────────────────────────

const MODULE_ICON: Record<string, LucideIcon> = {
  crm: Briefcase, finance: FileText, productivity: CheckCircle2,
  hr: Users, autopilot: Bot, integration: Webhook,
};

function SignalFeed({ events, loading }: { events: WorkspaceEvent[]; loading: boolean }) {
  if (loading) return <Loading />;
  if (events.length === 0) return <Empty icon={Activity} text="Ingen signaler endnu. Opret en lead, flyt en deal, eller send en faktura." />;

  return (
    <ScrollArea className="flex-1">
      <div className="divide-y divide-border/30">
        <AnimatePresence initial={false}>
          {events.map((e) => {
            const Icon = MODULE_ICON[e.source_module] ?? Sparkles;
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                className="px-4 py-3 hover:bg-card/40 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="h-7 w-7 rounded-md bg-card/60 border border-border/40 flex items-center justify-center shrink-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium font-mono">{e.type}</span>
                      <span className="text-[10px] text-muted-foreground/60">
                        {new Date(e.created_at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <SignalSummary event={e} />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
}

function SignalSummary({ event }: { event: WorkspaceEvent }) {
  const p = event.payload || {};
  const summary = (() => {
    switch (event.type) {
      case "lead.created": return `${p.name ?? "Lead"} · ${p.company ?? ""} · score ${p.score ?? 0}`;
      case "lead.status_changed": return `${p.name}: ${p.from} → ${p.to}`;
      case "deal.created": return `${p.title} · ${formatMoney(p.value)}`;
      case "deal.won": return `🏆 ${p.title} vundet · ${formatMoney(p.value)}`;
      case "deal.lost": return `${p.title} tabt`;
      case "deal.stage_changed": return `${p.title}: ${p.from} → ${p.to}`;
      case "invoice.created": return `Faktura ${p.number} · ${formatMoney(p.amount)}`;
      case "invoice.paid": return `Betalt: ${p.number} · ${formatMoney(p.amount)}`;
      case "task.created": return `Opgave: ${p.title}`;
      case "task.completed": return `✓ ${p.title}`;
      default: return JSON.stringify(p).slice(0, 80);
    }
  })();
  return <div className="text-[12px] text-muted-foreground mt-0.5 truncate">{summary}</div>;
}

function formatMoney(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(n);
}

// ─── AGENT CHAT ───────────────────────────────────────────────────────────

const QUICK = [
  "Giv mig et morgenbrief: top 5 ting jeg bør handle på i dag",
  "Find leads med score > 70 der ikke er blevet kontaktet",
  "Vis forfaldne fakturaer og foreslå rykker-emails",
  "Hvilke deals står stille i pipeline > 14 dage?",
];

function AgentChat({ companyId, userId }: { companyId: string | null; userId: string | null }) {
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);

  const transport = useMemo(() => new DefaultChatTransport({
    api: AGENT_URL,
    headers: token ? { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } : {},
    body: { companyId, userId },
  }), [token, companyId, userId]);

  const { messages, sendMessage, status, error } = useChat({ transport });

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length, status]);

  const submit = () => {
    const text = input.trim();
    if (!text || !companyId || !userId) return;
    sendMessage({ text });
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const isBusy = status === "submitted" || status === "streaming";
  const hasContext = !!companyId && !!userId;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">Start med at spørge om noget — agenten kan handle på tværs af alle moduler.</div>
              <div className="grid gap-2">
                {QUICK.map((q) => (
                  <button
                    key={q}
                    onClick={() => { if (hasContext) sendMessage({ text: q }); }}
                    className="text-left text-[12px] px-3 py-2 rounded-md border border-border/40 hover:border-primary/40 hover:bg-card/40 transition-colors text-foreground/80"
                    disabled={!hasContext}
                  >
                    <Sparkles className="inline h-3 w-3 mr-1.5 text-primary/70" />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => <Message key={m.id} m={m} />)}

          {isBusy && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Agenten arbejder…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-[11px] text-destructive">
              <AlertCircle className="h-3 w-3 mt-0.5" />
              <span>{error.message}</span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border/40 p-3 space-y-2 bg-card/20">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={hasContext ? "Spørg eller giv en intention…" : "Logger ind…"}
          rows={2}
          className="resize-none text-sm bg-background/60 border-border/40 focus-visible:ring-1 focus-visible:ring-primary/40"
          disabled={!hasContext || isBusy}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={!input.trim() || !hasContext || isBusy}>
            <Send className="h-3.5 w-3.5 mr-1.5" /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ToolPart {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

function Message({ m }: { m: UIMessage }) {
  const isUser = m.role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div className={cn(
        "h-7 w-7 rounded-full border flex items-center justify-center shrink-0",
        isUser ? "bg-primary/10 border-primary/30" : "bg-card border-border/50",
      )}>
        {isUser ? <span className="text-[10px] font-medium">DU</span> : <Bot className="h-3.5 w-3.5 text-primary" />}
      </div>
      <div className={cn("flex-1 space-y-2 min-w-0", isUser && "text-right")}>
        {m.parts.map((part, idx) => {
          if (part.type === "text") {
            return (
              <div key={idx} className={cn(
                "text-sm leading-relaxed inline-block px-3 py-2 rounded-lg max-w-[90%] whitespace-pre-wrap",
                isUser ? "bg-primary/10 text-foreground" : "bg-card/50 border border-border/30",
              )}>
                {part.text}
              </div>
            );
          }
          // tool parts (AI SDK v6: type starts with "tool-")
          if (typeof part.type === "string" && part.type.startsWith("tool-")) {
            return <ToolCallCard key={idx} part={part as ToolPart} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

function ToolCallCard({ part }: { part: ToolPart }) {
  const name = (part.type as string).replace(/^tool-/, "");
  const state = part.state as string | undefined;
  const isDone = state === "output-available";
  const isErr = state === "output-error";
  return (
    <details className="rounded-lg border border-border/40 bg-card/30 text-left">
      <summary className="cursor-pointer px-3 py-2 text-[11px] font-mono flex items-center gap-2">
        {isErr ? <AlertCircle className="h-3 w-3 text-destructive" /> :
          isDone ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> :
          <Loader2 className="h-3 w-3 animate-spin text-primary" />}
        <span className="text-foreground/90">{name}</span>
        <span className={cn("ml-auto text-[10px]", isErr ? "text-destructive" : "text-muted-foreground/70")}>{state}</span>
      </summary>
      <div className="px-3 pb-3 space-y-2 text-[11px] font-mono">
        {part.input && (
          <div>
            <div className="text-muted-foreground/60 mb-1">input</div>
            <pre className="bg-background/60 rounded p-2 overflow-x-auto">{JSON.stringify(part.input, null, 2)}</pre>
          </div>
        )}
        {part.output !== undefined && (
          <div>
            <div className="text-muted-foreground/60 mb-1">output</div>
            <pre className="bg-background/60 rounded p-2 overflow-x-auto max-h-60">{JSON.stringify(part.output, null, 2)}</pre>
          </div>
        )}
        {part.errorText && <div className="text-destructive">{part.errorText}</div>}
      </div>
    </details>
  );
}

// ─── ACTION QUEUE ─────────────────────────────────────────────────────────

const ACTION_ICON: Record<string, LucideIcon> = {
  send_email: Mail, trigger_webhook: Webhook, create_invoice: FileText,
};

function ActionQueue({ actions, loading }: { actions: AutopilotAction[]; loading: boolean }) {
  const exec = useExecuteAction();
  const updateStatus = useUpdateActionStatus();
  if (loading) return <Loading />;
  if (actions.length === 0) return <Empty icon={Inbox} text="Ingen handlinger i kø. Bed agenten foreslå noget." />;

  return (
    <ScrollArea className="flex-1">
      <div className="divide-y divide-border/30">
        <AnimatePresence initial={false}>
          {actions.map((a) => {
            const Icon = ACTION_ICON[a.action_type] ?? Sparkles;
            const isProposed = a.status === "proposed";
            const tone = a.status === "executed" ? "text-emerald-300/80"
              : a.status === "dismissed" ? "text-muted-foreground/60"
              : a.status === "failed" ? "text-destructive"
              : "text-primary";

            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <div className="h-7 w-7 rounded-md bg-card/60 border border-border/40 flex items-center justify-center shrink-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-sm font-medium leading-tight">{a.headline}</div>
                    {a.rationale && <div className="text-[11px] text-muted-foreground leading-relaxed">{a.rationale}</div>}
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em]">
                      <span className={tone}>{a.status}</span>
                      <span className="text-muted-foreground/50">{new Date(a.created_at).toLocaleString("da-DK")}</span>
                    </div>
                  </div>
                </div>
                {isProposed && (
                  <div className="mt-3 flex items-center gap-1 pl-10">
                    <Button
                      size="sm" className="h-7 text-[11px]"
                      onClick={() => exec.mutate(a)}
                      disabled={exec.isPending}
                    >
                      {exec.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                      Approve & udfør
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground"
                      onClick={() => updateStatus.mutate({ id: a.id, status: "dismissed" })}
                    >
                      <X className="h-3 w-3 mr-1" /> Afvis
                    </Button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
}

// ─── shared ───────────────────────────────────────────────────────────────

function Loading() {
  return (
    <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Henter…
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 text-sm text-muted-foreground">
      <Icon className="h-6 w-6 text-muted-foreground/40 mb-2" />
      <p className="max-w-xs leading-relaxed">{text}</p>
    </div>
  );
}
