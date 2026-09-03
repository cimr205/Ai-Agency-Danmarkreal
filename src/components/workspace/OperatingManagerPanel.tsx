import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronRight, CircleAlert,
  History, Inbox, Loader2, RefreshCw, Send, ShieldCheck, Sparkles,
  Target, Undo2, X, Zap,
} from "lucide-react";
import { isLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useOperatingAction, useOperatingBrief, useOperatingCommand,
  type OperatingAction, type OperatingSignal,
} from "@/hooks/api/useOperatingManager";

type View = "today" | "approvals" | "signals" | "history";

const VIEWS: Array<{ id: View; label: string; icon: typeof Target }> = [
  { id: "today", label: "I dag", icon: Target },
  { id: "approvals", label: "Godkend", icon: ShieldCheck },
  { id: "signals", label: "Signaler", icon: Zap },
  { id: "history", label: "Historik", icon: History },
];

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-blue-500",
  low: "bg-slate-400",
  info: "bg-slate-300",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function OperatingManagerPanel() {
  const [view, setView] = useState<View>("today");
  const [commandText, setCommandText] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const brief = useOperatingBrief();
  const command = useOperatingCommand();
  const actionMutation = useOperatingAction();
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";

  const awaiting = useMemo(() => (brief.data?.actions ?? []).filter((item) => ["proposed", "awaiting_approval"].includes(item.status)), [brief.data?.actions]);
  const history = useMemo(() => (brief.data?.actions ?? []).filter((item) => !["proposed", "awaiting_approval"].includes(item.status)), [brief.data?.actions]);
  const signals = useMemo(() => brief.data?.signals ?? [], [brief.data?.signals]);
  const today = useMemo(() => signals.filter((item) => item.category === "today" || item.severity === "critical").slice(0, 8), [signals]);
  const model = brief.data?.model;
  const modelLabel = !brief.data
    ? "Kontrollerer AI…"
    : model?.online
      ? `Open-source AI online${model.name ? ` · ${model.name}` : ""}`
      : model?.configured ? "AI-server kan ikke nås" : "Handlingsmotor klar · AI mangler";

  const submit = async (text = commandText) => {
    const clean = text.trim();
    if (!clean || command.isPending) return;
    try {
      const result = await command.mutateAsync(clean);
      setAnswer(result.reply);
      setCommandText("");
      if (result.proposals.length) setView("approvals");
    } catch (error) {
      setAnswer(error instanceof Error
        ? `Jeg kunne ikke færdiggøre svaret: ${error.message}`
        : "Jeg kunne ikke færdiggøre svaret. Prøv igen om et øjeblik.");
    }
  };

  const openSignal = (signal: OperatingSignal) => {
    if (signal.href) navigate(`/${locale}/app/${signal.href}`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border/50 px-4 pb-3 pt-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                {model?.online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/50" />}
                <span className={cn("relative inline-flex h-2 w-2 rounded-full", model?.online ? "bg-emerald-500" : model?.configured ? "bg-amber-500" : "bg-slate-400")} />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground" title={model?.error}>{modelLabel}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-foreground">Hvad skal virksomheden gøre nu?</p>
          </div>
          <button
            type="button"
            onClick={() => brief.refetch()}
            disabled={brief.isFetching}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label="Opdater driftsbillede"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", brief.isFetching && "animate-spin")} />
          </button>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="relative">
          <label htmlFor="operating-command" className="sr-only">Giv driftslederen en kommando</label>
          <input
            id="operating-command"
            value={commandText}
            onChange={(event) => setCommandText(event.target.value)}
            placeholder="Skriv en opgave eller et spørgsmål…"
            className="h-11 w-full rounded-xl border border-border/60 bg-background px-3 pr-11 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
            disabled={command.isPending}
          />
          <button
            type="submit"
            disabled={!commandText.trim() || command.isPending}
            className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-85 disabled:opacity-30"
            aria-label="Send kommando"
          >
            {command.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>

        {answer && (
          <div className="mt-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-3 text-xs leading-relaxed text-foreground/85">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Driftsleder
              <button type="button" onClick={() => setAnswer(null)} className="ml-auto grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Luk svar">
                <X className="h-3 w-3" />
              </button>
            </div>
            <p className="whitespace-pre-line">{answer}</p>
          </div>
        )}

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Hurtige kommandoer">
          {["Hvad er vigtigst?", "Lav min dag klar", "Opret opgave: Følg op på varme leads"].map((label) => (
            <button key={label} type="button" onClick={() => void submit(label)} disabled={command.isPending}
              className="h-7 shrink-0 rounded-full border border-border/50 px-2.5 text-[10px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50">
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 border-b border-border/50 px-2" role="tablist" aria-label="Driftsleder visninger">
        {VIEWS.map(({ id, label, icon: Icon }) => {
          const count = id === "approvals" ? awaiting.length : id === "signals" ? signals.length : id === "today" ? today.length : 0;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={cn("relative flex h-12 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground", view === id && "text-foreground")}
            >
              <span className="flex items-center gap-1"><Icon className="h-3.5 w-3.5" />{count > 0 && <span>{count}</span>}</span>
              <span>{label}</span>
              {view === id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-foreground" />}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {brief.isLoading ? (
          <PanelState icon={Loader2} text="Bygger driftsbilledet fra virksomhedens data…" spin />
        ) : brief.isError ? (
          <PanelState icon={CircleAlert} text={brief.error instanceof Error ? brief.error.message : "Driftsbilledet kunne ikke hentes"} action={() => brief.refetch()} />
        ) : view === "today" ? (
          <TodayView stats={brief.data?.stats} signals={today} pending={awaiting.slice(0, 3)} onSignal={openSignal} onOpenApprovals={() => setView("approvals")} />
        ) : view === "approvals" ? (
          <ActionList actions={awaiting} mutation={actionMutation} empty="Intet afventer din godkendelse." />
        ) : view === "signals" ? (
          <SignalList signals={signals} onOpen={openSignal} />
        ) : (
          <ActionList actions={history} mutation={actionMutation} empty="Historikken bliver synlig, når handlinger udføres eller afvises." history />
        )}
      </div>

      <div className="flex h-9 shrink-0 items-center justify-between border-t border-border/40 px-4 text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
        <span>{model?.online ? "AI + faktiske data" : "Faktiske data"} · Godkend før ændring</span>
        <span>{brief.data ? formatTime(brief.data.generatedAt) : "—"}</span>
      </div>
    </div>
  );
}

function TodayView({ stats, signals, pending, onSignal, onOpenApprovals }: {
  stats?: { critical: number; today: number; opportunities: number; awaitingApproval: number };
  signals: OperatingSignal[];
  pending: OperatingAction[];
  onSignal: (signal: OperatingSignal) => void;
  onOpenApprovals: () => void;
}) {
  return (
    <div className="space-y-5 p-4">
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Kræver blik" value={(stats?.critical ?? 0) + (stats?.today ?? 0)} tone="urgent" />
        <Metric label="Afventer dig" value={stats?.awaitingApproval ?? 0} />
        <Metric label="Muligheder" value={stats?.opportunities ?? 0} />
        <Metric label="Åbne signaler" value={signals.length} />
      </div>

      <section>
        <SectionLabel>Her er det vigtigste</SectionLabel>
        {signals.length ? (
          <div className="mt-2 space-y-2">
            {signals.map((signal) => <SignalCard key={signal.id} signal={signal} onOpen={onSignal} />)}
          </div>
        ) : (
          <EmptyInline icon={CheckCircle2} text="Ingen kritiske forhold i de aktuelle data." />
        )}
      </section>

      {pending.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <SectionLabel>Klar til beslutning</SectionLabel>
            <button type="button" onClick={onOpenApprovals} className="flex h-8 items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground">Se alle <ChevronRight className="h-3 w-3" /></button>
          </div>
          <button type="button" onClick={onOpenApprovals} className="mt-2 w-full rounded-xl border border-border/50 bg-card/40 p-3 text-left transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-2 text-xs font-medium"><ShieldCheck className="h-4 w-4 text-primary" />{pending.length} {pending.length === 1 ? "handling" : "handlinger"} afventer godkendelse</div>
            <p className="mt-1 pl-6 text-[11px] text-muted-foreground">{pending[0].headline}</p>
          </button>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "urgent" }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/30 p-3">
      <div className={cn("text-xl font-semibold tabular-nums", tone === "urgent" && value > 0 && "text-red-500")}>{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">{children}</h3>;
}

function SignalList({ signals, onOpen }: { signals: OperatingSignal[]; onOpen: (signal: OperatingSignal) => void }) {
  if (!signals.length) return <PanelState icon={CheckCircle2} text="Ingen åbne signaler. Driftsbilledet er roligt." />;
  const groups = [
    { label: "Kritiske signaler", items: signals.filter((item) => ["critical", "high"].includes(item.severity)) },
    { label: "I dag og prioriteter", items: signals.filter((item) => !["critical", "high"].includes(item.severity) && item.category !== "opportunity") },
    { label: "Muligheder", items: signals.filter((item) => item.category === "opportunity") },
  ].filter((group) => group.items.length);
  return (
    <div className="space-y-5 p-4">
      {groups.map((group) => (
        <section key={group.label}>
          <SectionLabel>{group.label}</SectionLabel>
          <div className="mt-2 space-y-2">{group.items.map((signal) => <SignalCard key={signal.id} signal={signal} onOpen={onOpen} />)}</div>
        </section>
      ))}
    </div>
  );
}

function SignalCard({ signal, onOpen }: { signal: OperatingSignal; onOpen: (signal: OperatingSignal) => void }) {
  return (
    <button type="button" onClick={() => onOpen(signal)} disabled={!signal.href}
      className="group w-full rounded-xl border border-border/50 bg-card/30 p-3 text-left transition-colors hover:border-border hover:bg-muted/50 disabled:cursor-default">
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_STYLE[signal.severity])} aria-label={signal.severity} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium leading-snug text-foreground">{signal.title}</span>
          <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{signal.reason}</span>
          {signal.recommended_action && <span className="mt-2 flex items-center gap-1 text-[10px] font-medium text-foreground/75">{signal.recommended_action}<ArrowRight className="h-3 w-3" /></span>}
        </span>
      </div>
    </button>
  );
}

function ActionList({ actions, mutation, empty, history = false }: {
  actions: OperatingAction[];
  mutation: ReturnType<typeof useOperatingAction>;
  empty: string;
  history?: boolean;
}) {
  if (!actions.length) return <PanelState icon={history ? History : Inbox} text={empty} />;
  return <div className="space-y-3 p-4">{actions.map((action) => <ActionCard key={action.id} action={action} mutation={mutation} history={history} />)}</div>;
}

function ActionCard({ action, mutation, history }: { action: OperatingAction; mutation: ReturnType<typeof useOperatingAction>; history: boolean }) {
  const [editing, setEditing] = useState(false);
  const original = action.execution_payload ?? action.preview?.fields ?? {};
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(original).map(([key, value]) => [key, isPlainObject(value) ? JSON.stringify(value, null, 2) : String(value ?? "")]),
  ));
  const [editError, setEditError] = useState<string | null>(null);
  const pending = ["proposed", "awaiting_approval"].includes(action.status);
  const retryable = action.status === "failed";
  const busy = mutation.isPending && mutation.variables?.actionId === action.id;
  const fields = Object.entries(original);

  const saveDraft = () => {
    try {
      const parsed = Object.fromEntries(fields.map(([key, value]) => {
        if (typeof value === "number") return [key, Number(draft[key])];
        if (isPlainObject(value)) return [key, JSON.parse(draft[key])];
        return [key, draft[key]];
      }));
      setEditError(null);
      mutation.mutate({ operation: "edit", actionId: action.id, input: parsed }, { onSuccess: () => setEditing(false) });
    } catch {
      setEditError("JSON-feltet er ikke gyldigt.");
    }
  };

  return (
    <article className="rounded-xl border border-border/60 bg-card/35 p-3">
      <div className="flex items-start gap-2.5">
        <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", pending ? "bg-primary/10 text-primary" : action.status === "failed" ? "bg-red-500/10 text-red-500" : "bg-muted text-muted-foreground")}>
          {action.status === "failed" ? <AlertTriangle className="h-4 w-4" /> : action.status === "completed" || action.status === "executed" ? <Check className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-medium leading-snug">{action.headline}</h3>
          {action.rationale && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{action.rationale}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
            <span className="rounded border border-border/50 px-1.5 py-0.5">{action.risk_level} risiko</span>
            <span>{action.connector === "internal" ? "Internt" : action.connector}</span>
            <span>·</span><span>{formatTime(action.created_at)}</span>
          </div>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
          {fields.map(([key, value]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-[10px] text-muted-foreground">{key.replace(/_/g, " ")}</span>
              {isPlainObject(value) ? (
                <textarea value={draft[key] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} rows={4}
                  className="w-full resize-y rounded-lg border border-border/60 bg-background px-2.5 py-2 font-mono text-[10px] outline-none focus:border-primary/60" />
              ) : (
                <input value={draft[key] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                  className="h-9 w-full rounded-lg border border-border/60 bg-background px-2.5 text-xs outline-none focus:border-primary/60" />
              )}
            </label>
          ))}
          {editError && <p className="text-[10px] text-red-500">{editError}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={saveDraft} disabled={busy}
              className="h-9 rounded-lg bg-foreground px-3 text-[11px] font-medium text-background disabled:opacity-50">Gem ændring</button>
            <button type="button" onClick={() => setEditing(false)} className="h-9 rounded-lg px-3 text-[11px] text-muted-foreground hover:bg-muted">Annuller</button>
          </div>
        </div>
      ) : (
        <details className="mt-3 border-t border-border/40 pt-2">
          <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">Se handlingsdata</summary>
          <dl className="mt-2 space-y-1.5">
            {Object.entries(action.execution_payload ?? action.preview?.fields ?? {}).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[100px_1fr] gap-2 text-[10px]"><dt className="text-muted-foreground">{key.replace(/_/g, " ")}</dt><dd className="break-words text-foreground/80">{String(value)}</dd></div>
            ))}
          </dl>
          {action.preview?.rollback && <p className="mt-2 flex items-start gap-1 text-[10px] text-muted-foreground"><Undo2 className="mt-0.5 h-3 w-3 shrink-0" />{action.preview.rollback}</p>}
        </details>
      )}

      {action.failure_reason && <p className="mt-3 rounded-lg bg-red-500/10 p-2 text-[10px] leading-relaxed text-red-600 dark:text-red-300">{action.failure_reason}</p>}

      {!editing && (pending || retryable) && !history && (
        <div className="mt-3 flex items-center gap-2 border-t border-border/40 pt-3">
          <button type="button" onClick={() => mutation.mutate({ operation: retryable ? "retry" : "approve", actionId: action.id })} disabled={busy}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground text-[11px] font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : retryable ? <RefreshCw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {retryable ? "Prøv igen" : "Godkend og udfør"}
          </button>
          {pending && <button type="button" onClick={() => setEditing(true)} disabled={busy} className="h-10 rounded-lg border border-border/60 px-3 text-[11px] hover:bg-muted">Rediger</button>}
          {pending && <button type="button" onClick={() => mutation.mutate({ operation: "reject", actionId: action.id })} disabled={busy} className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-red-500" aria-label="Afvis handling"><X className="h-4 w-4" /></button>}
        </div>
      )}
    </article>
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function EmptyInline({ icon: Icon, text }: { icon: typeof CheckCircle2; text: string }) {
  return <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-border/60 p-3 text-[11px] text-muted-foreground"><Icon className="h-4 w-4 text-emerald-500" />{text}</div>;
}

function PanelState({ icon: Icon, text, spin, action }: { icon: typeof Loader2; text: string; spin?: boolean; action?: () => void }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center px-8 text-center text-xs leading-relaxed text-muted-foreground">
      <Icon className={cn("mb-3 h-6 w-6 text-muted-foreground/50", spin && "animate-spin")} />
      <p>{text}</p>
      {action && <button type="button" onClick={action} className="mt-3 h-9 rounded-lg border border-border/60 px-3 text-[11px] text-foreground hover:bg-muted">Prøv igen</button>}
    </div>
  );
}
