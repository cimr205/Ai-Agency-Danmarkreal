import { relationshipTemperature } from "@/lib/clientIntelligence";
import { useCurrency } from "@/contexts/CurrencyContext";
import { formatDistanceToNow } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import { da } from "date-fns/locale";

interface Props {
  customer: Tables<"customers">;
  summary: string;
  daysSinceTouch: number;
  pipelineValue: number;
  invoicedThisYear: number;
  lastTouch?: string;
}

const TEMP_COLOR = {
  hot: "bg-orange-400",
  warm: "bg-amber-300",
  cool: "bg-sky-300/80",
  cold: "bg-muted-foreground/40",
};

/**
 * A flowing narrative panel — no boxes, no AI badges.
 * The relationship reads like a sentence, with quiet inline metrics below.
 */
export function ClientRelationshipBar({
  customer, summary, daysSinceTouch, pipelineValue, invoicedThisYear, lastTouch,
}: Props) {
  const { format } = useCurrency();
  const temp = relationshipTemperature(daysSinceTouch);

  return (
    <div className="border-l-2 border-border/60 pl-6 py-2 space-y-5 max-w-3xl">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/60">
        <span className={`h-1.5 w-1.5 rounded-full ${TEMP_COLOR[temp.tone]}`} />
        <span>{temp.label} relation</span>
      </div>

      <p className="text-[16px] sm:text-[17px] text-foreground/90 leading-relaxed font-light">
        {summary}
      </p>

      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[12.5px] text-muted-foreground/80">
        <span>
          Sidste kontakt{" "}
          <span className="text-foreground/85 tabular-nums">
            {lastTouch ? formatDistanceToNow(new Date(lastTouch), { locale: da, addSuffix: true }) : "—"}
          </span>
        </span>
        <span className="text-muted-foreground/30">·</span>
        <span>
          Pipeline <span className="text-foreground/85 tabular-nums">{format(pipelineValue)}</span>
        </span>
        <span className="text-muted-foreground/30">·</span>
        <span>
          Omsat i år <span className="text-foreground/85 tabular-nums">{format(invoicedThisYear)}</span>
        </span>
      </div>
    </div>
  );
}
