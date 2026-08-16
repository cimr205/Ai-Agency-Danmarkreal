import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import { useAiActions, type AiActionMessage } from "@/hooks/useAiActions";
import { Input } from "@/components/ui/input";

/**
 * Ambient AI bar — discreet trigger in the workspace shell.
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
        className="flex items-center gap-2 px-3 h-8 rounded-full border border-border/40 bg-card/30 hover:bg-card/60 text-xs text-muted-foreground transition-colors"
        aria-label="Ambient AI"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        <span className="hidden sm:inline font-mono uppercase tracking-[0.18em] text-[10px]">AI klar</span>
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
              className="w-full max-w-xl rounded-2xl border border-border/50 bg-card/95 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/70">
                  Operationel AI
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
                    {pendingConfirm ? "Bekræftelse påkrævet" : "Lovable AI · Gemini 2.5"}
                  </span>
                  <div className="flex items-center gap-2">
                    {pendingConfirm && (
                      <button type="button" onClick={() => run(true)}
                        className="px-3 h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">
                        Bekræft & udfør
                      </button>
                    )}
                    <button type="submit" disabled={ai.isPending || (!value.trim() && !pendingConfirm)}
                      className="h-8 w-8 flex items-center justify-center rounded-md bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40">
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
