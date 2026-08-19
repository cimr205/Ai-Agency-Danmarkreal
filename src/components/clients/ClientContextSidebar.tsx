import type { Signal } from "@/lib/clientIntelligence";
import type { Tables } from "@/integrations/supabase/types";

const STAGE_LABELS: Record<string, string> = {
  discovery: "Discovery", qualification: "Kvalificering", proposal: "Tilbud",
  negotiation: "Forhandling", won: "Vundet", lost: "Tabt",
};

const TONE = {
  risk: "border-destructive/50 text-destructive/90",
  opportunity: "border-emerald-400/40 text-emerald-300/90",
  suggestion: "border-amber-300/40 text-amber-200/90",
  info: "border-border/60 text-muted-foreground/80",
};

/**
 * Calm contextual stream — no header chip, no boxes.
 * Each signal reads as a small note in the margin.
 */
export function ClientContextSidebar({
  signals, deals,
}: {
  signals: Signal[];
  deals: Tables<"deals">[];
}) {
  const activeDeals = deals.filter(d => !["won", "lost"].includes(d.stage)).slice(0, 4);

  return (
    <div className="space-y-8">
      {signals.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground/60 italic leading-relaxed">
          Alt ser roligt ud her. Brug øjeblikket på dybt arbejde.
        </p>
      ) : (
        <ul className="space-y-4">
          {signals.map(s => (
            <li key={s.id} className={`border-l pl-4 py-0.5 ${TONE[s.kind]}`}>
              <div className="text-[13px] text-foreground/90 leading-snug">{s.title}</div>
              {s.detail && (
                <div className="text-[12px] text-muted-foreground/75 leading-snug mt-1">{s.detail}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {activeDeals.length > 0 && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/50 mb-3">
            Åbne deals
          </div>
          <ul className="space-y-2">
            {activeDeals.map(d => (
              <li key={d.id} className="text-[12.5px] text-foreground/85 flex items-baseline justify-between gap-3">
                <span className="truncate">{d.title}</span>
                <span className="text-[10.5px] text-muted-foreground/60 shrink-0">
                  {STAGE_LABELS[d.stage] || d.stage}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
