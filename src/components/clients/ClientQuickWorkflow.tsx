import { useState } from "react";
import { Zap, ArrowRight, CheckCircle2, Calendar as CalIcon, Flag, Webhook, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useCreateTask } from "@/hooks/api/useTasks";
import { fireWebhookEvent } from "@/hooks/api/useWebhooks";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from '@/lib/errors';

interface Props {
  customer: { id: string; name: string };
}

type DueKey = "today" | "tomorrow" | "3d" | "1w";
const DUE_LABELS: Record<DueKey, string> = {
  today: "I dag",
  tomorrow: "I morgen",
  "3d": "Om 3 dage",
  "1w": "Næste uge",
};

function dueDate(key: DueKey): string {
  const d = new Date();
  const add = key === "today" ? 0 : key === "tomorrow" ? 1 : key === "3d" ? 3 : 7;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

const AUTOMATIONS: { id: string; label: string; event: "lead.updated" | "deal.created" | "email.sent"; hint: string }[] = [
  { id: "followup",  label: "Send opfølgning",        event: "email.sent",   hint: "Trigger mail-sekvens" },
  { id: "nurture",   label: "Start nurture-flow",     event: "lead.updated", hint: "Tildel til kampagne" },
  { id: "handoff",   label: "Overdrag til sælger",    event: "deal.created", hint: "Notificér team" },
];

export function ClientQuickWorkflow({ customer }: Props) {
  const { profile } = useAuth();
  const createTask = useCreateTask();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"action" | "task" | "automation">("action");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<DueKey>("tomorrow");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [busy, setBusy] = useState<string | null>(null);

  const submitTask = async (kind: "action" | "task") => {
    const t = title.trim() || (kind === "action" ? `Næste skridt med ${customer.name}` : "");
    if (!t) {
      toast({ title: "Skriv en titel", variant: "destructive" });
      return;
    }
    try {
      await createTask.mutateAsync({
        title: t,
        due_date: dueDate(due),
        priority: kind === "action" ? "high" : priority,
        description: `Klient: ${customer.name}`,
      });
      toast({ title: kind === "action" ? "Næste skridt gemt" : "Opgave oprettet", description: `${t} · ${DUE_LABELS[due]}` });
      setTitle("");
      setOpen(false);
    } catch (e) {
      toast({ title: "Fejl", description: getErrorMessage(e) || String(e), variant: "destructive" });
    }
  };

  const triggerAutomation = async (a: typeof AUTOMATIONS[number]) => {
    if (!profile?.company_id) return;
    setBusy(a.id);
    try {
      await fireWebhookEvent(profile.company_id, a.event, {
        customer_id: customer.id,
        customer_name: customer.name,
        automation: a.id,
        triggered_at: new Date().toISOString(),
      });
      toast({ title: "Automation kørt", description: a.label });
      setOpen(false);
    } catch (e) {
      toast({ title: "Fejl", description: getErrorMessage(e) || String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const tabs: { id: typeof tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "action",     label: "Næste skridt", icon: ArrowRight },
    { id: "task",       label: "Opgave",       icon: CheckCircle2 },
    { id: "automation", label: "Automation",   icon: Webhook },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.10] text-[12px] text-foreground/90 transition-colors"
          title="Workflow"
        >
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="hidden sm:inline">Workflow</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[340px] p-0 bg-background border-border/70">
        <div className="flex border-b border-border/60">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 h-9 text-[11.5px] font-mono uppercase tracking-[0.1em] transition-colors ${
                tab === t.id ? "text-foreground border-b border-primary" : "text-muted-foreground/70 hover:text-foreground"
              }`}
            >
              <t.icon className="h-3 w-3" /> {t.label}
            </button>
          ))}
        </div>

        <div className="p-3.5 space-y-3">
          {(tab === "action" || tab === "task") && (
            <>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={tab === "action" ? `Næste skridt med ${customer.name}…` : "Opgave-titel…"}
                className="h-9 text-[13px]"
                autoFocus
              />
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground/60 mb-1.5 inline-flex items-center gap-1">
                  <CalIcon className="h-3 w-3" /> Forfald
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {(Object.keys(DUE_LABELS) as DueKey[]).map(k => (
                    <button
                      key={k}
                      onClick={() => setDue(k)}
                      className={`h-7 rounded text-[11px] border transition-colors ${
                        due === k
                          ? "border-primary/50 bg-primary/[0.10] text-foreground"
                          : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                      }`}
                    >
                      {DUE_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>

              {tab === "task" && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground/60 mb-1.5 inline-flex items-center gap-1">
                    <Flag className="h-3 w-3" /> Prioritet
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(["low", "medium", "high"] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setPriority(p)}
                        className={`h-7 rounded text-[11px] border capitalize transition-colors ${
                          priority === p
                            ? "border-primary/50 bg-primary/[0.10] text-foreground"
                            : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                        }`}
                      >
                        {p === "low" ? "Lav" : p === "medium" ? "Mellem" : "Høj"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => submitTask(tab)}
                disabled={createTask.isPending}
                className="w-full h-9 rounded-md bg-primary text-primary-foreground text-[12.5px] font-medium hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {createTask.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {tab === "action" ? "Gem næste skridt" : "Opret opgave"}
              </button>
            </>
          )}

          {tab === "automation" && (
            <div className="space-y-1">
              <p className="text-[11.5px] text-muted-foreground/80 mb-2 leading-relaxed">
                Udløs en konfigureret automation for {customer.name}.
              </p>
              {AUTOMATIONS.map(a => (
                <button
                  key={a.id}
                  onClick={() => triggerAutomation(a)}
                  disabled={busy !== null}
                  className="w-full text-left p-2.5 rounded-md border border-border/50 hover:border-border hover:bg-foreground/[0.03] transition-colors group disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12.5px] text-foreground/90 truncate">{a.label}</div>
                      <div className="text-[10.5px] text-muted-foreground/70 mt-0.5">{a.hint}</div>
                    </div>
                    {busy === a.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-primary shrink-0 transition-colors" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
