import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus, Filter, Send, Bot, ChevronRight, PlayCircle, History, Loader2, Mail, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useWorkflows } from "@/hooks/api/useWorkflows";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from '@/lib/errors';

type StepKind = "trigger" | "filter" | "ai" | "action";

const stepTone: Record<StepKind, string> = {
  trigger: "border-primary/40 bg-primary/[0.04]",
  filter: "border-amber-400/30 bg-amber-400/[0.03]",
  ai: "border-violet-400/30 bg-violet-400/[0.03]",
  action: "border-emerald-400/30 bg-emerald-400/[0.03]",
};
const stepLabel: Record<StepKind, string> = {
  trigger: "Trigger", filter: "Filter", ai: "AI", action: "Handling",
};

type Trace = { step: string; status: "ok" | "skip" | "error"; detail: string };
type FlowStepData = { id: string; kind: StepKind; icon: React.ComponentType<{ className?: string }>; title: string; detail: string };

export default function WorkflowStudioPage() {
  const { data: workflows = [], isLoading } = useWorkflows();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [trace, setTrace] = useState<Trace[]>([]);
  const [running, setRunning] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("Vurdér om denne event kræver opfølgning.");

  const active = useMemo(
    () => workflows.find(w => w.id === activeId) ?? workflows[0],
    [workflows, activeId]
  );

  const synthSteps = useMemo(() => {
    if (!active) return [];
    return [
      { id: "t", kind: "trigger" as StepKind, icon: Mail, title: `Når ${active.trigger_event}`, detail: "Workspace event" },
      { id: "f", kind: "filter" as StepKind, icon: Filter, title: "Filter (klient-side)", detail: "Konfigurérbar" },
      { id: "a", kind: "ai" as StepKind, icon: Bot, title: "AI-trin", detail: aiPrompt.slice(0, 60) },
      {
        id: "x", kind: "action" as StepKind,
        icon: active.action_type === "webhook" ? Send : Calendar,
        title: `Handling: ${active.action_type}`,
        detail: active.webhook_url ? "→ webhook" : "ingen destination",
      },
    ];
  }, [active, aiPrompt]);

  const runWorkflow = async (mode: "test" | "live") => {
    if (!active) return;
    setRunning(true);
    setTrace([]);
    try {
      const { data, error } = await supabase.functions.invoke("workflow-runner", {
        body: { workflow_id: active.id, mode, ai_prompt: aiPrompt, payload: { sample: true, ts: Date.now() } },
      });
      if (error) throw error;
      setTrace((data as { trace?: Trace[] } | null)?.trace ?? []);
      toast.success(mode === "test" ? "Test-kørsel fuldført" : "Workflow kørt live");
    } catch (e) {
      toast.error(getErrorMessage(e) || "Kørsel fejlede");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-14 pb-20">
      <header className="space-y-6">
        <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-muted-foreground/50">
          Workspace · Workflow Studio
        </div>
        <div className="flex items-end justify-between gap-8 flex-wrap">
          <div className="space-y-3 max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-tight font-display">
              Automatiseringer der <span className="text-muted-foreground/60">tænker.</span>
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed">
              Triggers fra Smart Inbox, AI-beslutninger, handlinger på tværs af Gmail, Calendar og webhook-modtagere.
              Test før du går live — hvert trin spores.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => runWorkflow("test")} disabled={!active || running}>
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />} Test-kør
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => runWorkflow("live")} disabled={!active || running}>
              <PlayCircle className="h-4 w-4" /> Kør live
            </Button>
          </div>
        </div>
      </header>

      {isLoading && <div className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Henter workflows…</div>}
      {!isLoading && workflows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/50 p-10 text-center text-muted-foreground">
          Ingen workflows endnu. Opret ét under Indstillinger → Webhooks for at se det her.
        </div>
      )}

      {workflows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_320px] gap-x-10 gap-y-10">
          {/* Workflow list */}
          <aside className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">Flows</div>
            {workflows.map(w => (
              <button key={w.id} onClick={() => { setActiveId(w.id); setTrace([]); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active?.id === w.id ? "bg-card/60 text-foreground" : "text-muted-foreground hover:bg-card/30"
                }`}>
                <div className="truncate">{w.description || w.trigger_event}</div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50 mt-0.5">
                  {w.run_count ?? 0} kørsler · {w.is_active ? "aktiv" : "pauset"}
                </div>
              </button>
            ))}
          </aside>

          {/* Canvas */}
          <section className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 mb-5">
              {active?.description || "Flow"}
            </div>

            {synthSteps.map((s, i) => (
              <FlowStep key={s.id} step={s} index={i} isLast={i === synthSteps.length - 1} />
            ))}

            <button
              className="mt-3 ml-7 flex items-center gap-2 text-xs text-muted-foreground/60 hover:text-foreground transition-colors group"
              onClick={() => toast.info("Trin-katalog kommer i næste iteration")}
            >
              <span className="h-6 w-6 rounded-full border border-dashed border-border/60 flex items-center justify-center group-hover:border-primary/40">
                <Plus className="h-3 w-3" />
              </span>
              Tilføj trin
            </button>

            <div className="mt-8">
              <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/60 mb-2 block">
                AI-prompt (bruges som AI-trin)
              </label>
              <textarea
                value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border/40 bg-card/30 px-3 py-2 text-sm focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:outline-none"
              />
            </div>
          </section>

          {/* Trace panel */}
          <aside className="lg:sticky lg:top-16 lg:self-start">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">
              Spor af seneste kørsel
            </div>
            {trace.length === 0 ? (
              <div className="text-xs text-muted-foreground/60 py-6 px-4 rounded-lg border border-dashed border-border/40">
                Endnu ingen kørsel. Tryk "Test-kør" for at se trin-for-trin spor.
              </div>
            ) : (
              <ul className="space-y-2.5">
                {trace.map((t, i) => (
                  <li key={i} className="flex items-start gap-3 text-xs">
                    <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${
                      t.status === "ok" ? "bg-emerald-400" : t.status === "error" ? "bg-destructive" : "bg-muted-foreground/30"
                    }`} />
                    <div className="min-w-0">
                      <div className="text-foreground/90 leading-snug font-mono text-[11px]">{t.step}</div>
                      <div className="text-muted-foreground mt-0.5 leading-relaxed">{t.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function FlowStep({ step, index, isLast }: { step: FlowStepData; index: number; isLast: boolean }) {
  const Icon = step.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-stretch gap-4"
    >
      <div className="flex flex-col items-center pt-4">
        <div className="h-7 w-7 rounded-full border border-border/50 bg-card flex items-center justify-center text-[10px] font-mono text-muted-foreground">
          {index + 1}
        </div>
        {!isLast && <div className="flex-1 w-px bg-gradient-to-b from-border/60 to-border/10 my-1" />}
      </div>
      <div className={`flex-1 my-1.5 px-5 py-4 rounded-xl border ${stepTone[step.kind as StepKind]}`}>
        <div className="flex items-center gap-4">
          <div className="h-9 w-9 rounded-lg bg-background/60 border border-border/40 flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-foreground/80" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/60">
              {stepLabel[step.kind as StepKind]}
            </span>
            <div className="text-sm font-medium tracking-tight">{step.title}</div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{step.detail}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
        </div>
      </div>
    </motion.div>
  );
}
