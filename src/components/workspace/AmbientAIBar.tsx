import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Command, X, Send, Loader2 } from "lucide-react";
import { useAiActions, type AiActionMessage } from "@/hooks/useAiActions";
import { Input } from "@/components/ui/input";

/**
 * Workspace action bar — discreet trigger in the workspace shell.
 * Press the dot to open a single-line action prompt that performs real
 * tool calls via the `ai-actions` edge function.
 */
export function AmbientAIBar() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ messages: AiActionMessage[] } | null>(null);
  const ai = useAiActions();

  const run = async (confirm = false) => {
    if (!value.trim() && !pendingConfirm) return;
    const messages = pendingConfirm?.messages ?? [{ role: "user", content: value.trim() }];
    const res = await ai.mutateAsync({ messages, confirm });
    setReply(res.reply);
    const needs = res.actions.some(a => a.error === "needs_confirmation");
    if (needs && !confirm) {
      setPendingConfirm({ messages: [...messages, { role: "assistant", content: res.reply }] });
    } else {
      setPendingConfirm(null);
      setValue("");
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        aria-label="Åbn handlingsfelt"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-stamp/30" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-stamp" />
        </span>
        <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] sm:inline">Klar</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-background/60 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
            onClick={() => { setOpen(false); setReply(null); setPendingConfirm(null); setValue(""); }}
          >
            <motion.div
              initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl overflow-hidden rounded-md border border-border/70 bg-card/95 shadow-2xl"
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-stamp text-stamp-foreground">
                  <Command className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Handlingsfelt
                </span>
                <button onClick={() => setOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); run(false); }} className="p-5 space-y-4">
                <Input
                  autoFocus value={value} onChange={(e) => setValue(e.target.value)}
                  placeholder="F.eks. 'Find Acme A/S og opret deal til 50.000 kr næste fredag'"
                  className="border-0 bg-transparent text-base focus-visible:ring-0 px-0 placeholder:text-muted-foreground/50"
                  disabled={ai.isPending}
                />

                {reply && (
                  <div className="text-sm text-foreground/90 leading-relaxed border-t border-border/30 pt-4 whitespace-pre-wrap">
                    {reply}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-2">
                  <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/40">
                    {pendingConfirm ? "Bekræftelse påkrævet" : "Klar til sikre handlinger"}
                  </span>
                  <div className="flex items-center gap-2">
                    {pendingConfirm && (
                      <button type="button" onClick={() => run(true)}
                        className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90">
                        Bekræft & udfør
                      </button>
                    )}
                    <button type="submit" disabled={ai.isPending || (!value.trim() && !pendingConfirm)}
                      className="flex h-8 w-8 items-center justify-center rounded-md bg-stamp/10 text-stamp hover:bg-stamp/20 disabled:opacity-40">
                      {ai.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
