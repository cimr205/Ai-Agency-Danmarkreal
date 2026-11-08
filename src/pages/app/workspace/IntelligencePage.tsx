import { motion } from "framer-motion";
import {
  Brain, Mail, Calendar, CheckCircle2, AlertTriangle, TrendingUp,
  Sparkles, Eye, EyeOff, Wand2, Loader2,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { da, de, enGB } from "date-fns/locale";
import { getLocaleFromPath } from "@/lib/i18n";
import { t3, tx } from '@/lib/inlineI18n';

interface LogRow {
  id: string;
  action_type: string;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export default function IntelligencePage() {
  const [quiet, setQuiet] = useState(true);
  const { profile } = useAuth();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["ai-action-logs", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async (): Promise<LogRow[]> => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id,action_type,description,metadata,created_at")
        .eq("company_id", profile!.company_id!)
        .in("action_type", ["ai_action", "workflow_run", "workflow_test"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as LogRow[];
    },
    refetchInterval: 15000,
  });

  const todayCount = logs.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length;
  const autoCount = logs.filter(l => l.action_type !== "workflow_test").length;

  return (
    <div className="space-y-14 pb-20">
      <header className="space-y-6">
        <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-muted-foreground/50">
          Workspace · {tx("Ambient intelligens", "Ambient intelligence")}
        </div>
        <div className="flex items-end justify-between gap-8 flex-wrap">
          <div className="space-y-3 max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-tight font-display">
              {tx("Ambient intelligens", "Ambient intelligence")}
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed">
              {tx("Assistenten observerer workspace, udfører trygge handlinger automatisk og foreslår resten. Aktivér den øverst i workspace-baren ved AI-prikken.", "The assistant watches the workspace, runs safe actions automatically and suggests the rest. Turn it on at the AI dot in the top workspace bar.")}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              {quiet ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {tx("Stille tilstand", "Quiet mode")}
            </div>
            <Switch checked={quiet} onCheckedChange={setQuiet} />
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border/30 rounded-xl overflow-hidden">
        <PulseCell value={String(todayCount)} label={tx("Handlinger i dag", "Actions today")} />
        <PulseCell value={String(autoCount)} label={tx("Udført automatisk", "Done automatically")} accent />
        <PulseCell value={String(logs.filter(l => l.action_type === "workflow_test").length)} label={tx("Test-kørsler", "Test runs")} />
        <PulseCell value={String(logs.filter(l => l.metadata?.status === "error").length)} label={tx("Fejlede", "Failed")} />
      </section>

      <section className="space-y-6">
        <div className="flex items-end justify-between">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">
            {tx("Strøm af handlinger", "Action stream")}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/40">
            {tx("opdateres ambient · hvert 15. sek", "updates ambiently · every 15 sec")}
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />{tx("Henter…", "Loading…")}</div>
        ) : logs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/50 p-10 text-center text-muted-foreground">
            {tx("Ingen ambient handlinger endnu. Brug AI-baren øverst eller test et workflow.", "No ambient actions yet. Use the AI bar at the top or test a workflow.")}
          </div>
        ) : (
          <ul className="space-y-1">
            {logs.map((log, i) => <ActionRow key={log.id} log={log} delay={i * 0.03} />)}
          </ul>
        )}
      </section>

      <section className="space-y-6">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">
          {tx("Hvad assistenten kan udføre", "What the assistant can do")}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border/30 rounded-xl overflow-hidden">
          {[
            { icon: Mail, surface: "Gmail", caps: [tx("Skriv udkast", "Write draft"), tx("Send svar (kræver bekræftelse)", "Send reply (needs confirmation)"), tx("Søg tråde", "Search threads")] },
            { icon: Calendar, surface: "Calendar", caps: [tx("Find tider", "Find times"), tx("Foreslå møde", "Suggest meeting"), tx("Genplanlæg", "Reschedule")] },
            { icon: TrendingUp, surface: "CRM", caps: [tx("Opret deal (kræver bekræftelse)", "Create deal (needs confirmation)"), tx("Opdater lead-status", "Update lead status"), tx("Søg klienter", "Search clients")] },
            { icon: CheckCircle2, surface: "Tasks", caps: [tx("Opret opgave", "Create task"), tx("Sæt deadline", "Set deadline"), tx("Sæt prioritet", "Set priority")] },
            { icon: Wand2, surface: "Workflows", caps: [tx("Trigger flow (kræver bekræftelse)", "Trigger flow (needs confirmation)"), tx("Test-kør", "Test run"), tx("Spor trin", "Trace steps")] },
            { icon: Brain, surface: tx("Indsigter", "Insights"), caps: [tx("Resumé", "Summary"), tx("Prioritering", "Prioritisation"), tx("Risiko-detektion", "Risk detection")] },
          ].map(c => <CapabilityCell key={c.surface} {...c} />)}
        </div>
      </section>

      <footer className="border-t border-border/40 pt-8 flex items-start gap-3 text-sm text-muted-foreground max-w-3xl">
        <Sparkles className="h-4 w-4 mt-0.5 text-primary/70 shrink-0" />
        <p className="leading-relaxed">
          {tx("Følsomme handlinger — afsendelse af email, sletning, oprettelse af deals — kræver altid bekræftelse. Alt andet sker stille i baggrunden og logges her.", "Sensitive actions — sending email, deleting, creating deals — always need confirmation. Everything else happens quietly in the background and is logged here.")}
        </p>
      </footer>
    </div>
  );
}

function PulseCell({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="bg-background p-6">
      <div className={`text-3xl font-semibold tabular-nums tracking-tight ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/50 mt-2">{label}</div>
    </div>
  );
}

function ActionRow({ log, delay }: { log: LogRow; delay: number }) {
  const isError = log.metadata?.status === "error";
  const isTest = log.action_type === "workflow_test";
  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="group flex items-start gap-5 py-5 border-b border-border/30 last:border-0 hover:bg-card/20 -mx-3 px-3 rounded-lg transition-colors"
    >
      <div className="h-8 w-8 rounded-lg border border-border/40 bg-card/40 flex items-center justify-center shrink-0">
        {isError ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> :
         isTest ? <Wand2 className="h-3.5 w-3.5 text-violet-300/80" /> :
                  <Brain className="h-3.5 w-3.5 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/70">
            {log.action_type.replace("_", " ")}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/40">
            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: { da, de }[getLocaleFromPath() as "da" | "de"] ?? enGB })}
          </span>
        </div>
        <div className="text-sm text-foreground/95 leading-snug">{/* stored in Danish by the AI edge function */}{log.description.replace(/^AI udførte /, t3("AI udførte ", "AI ran ", "KI-Aktion: "))}</div>
        {log.metadata?.tool && (
          <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed font-mono">
            {String(log.metadata.tool)}({Object.keys((log.metadata.input as Record<string, unknown>) ?? {}).join(", ")})
          </div>
        )}
      </div>
    </motion.li>
  );
}

function CapabilityCell({ icon: Icon, surface, caps }: { icon: LucideIcon; surface: string; caps: string[] }) {
  return (
    <div className="bg-background p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-8 w-8 rounded-lg bg-card/50 border border-border/40 flex items-center justify-center">
          <Icon className="h-4 w-4 text-foreground/80" />
        </div>
        <div className="text-sm font-medium">{surface}</div>
      </div>
      <ul className="space-y-1.5">
        {caps.map(c => (
          <li key={c} className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" /> {c}
          </li>
        ))}
      </ul>
    </div>
  );
}
