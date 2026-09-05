import { Link, useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface PipelineStage {
  name: string;
  count: number;
  color: string;
  value: number;
  stalled: number;
}

export function PipelineInsight({
  stages,
  isLoading,
  base,
  format,
}: {
  stages: PipelineStage[];
  isLoading: boolean;
  base: string;
  format: (v: number) => string;
}) {
  const navigate = useNavigate();
  const active = stages.filter((s) => s.count > 0);
  const totalValue = active.reduce((sum, s) => sum + s.value, 0);
  const totalCount = active.reduce((sum, s) => sum + s.count, 0);
  const worstStalled = [...active].filter((s) => s.stalled > 0).sort((a, b) => b.stalled - a.stalled)[0];
  const pipelineHref = `${base}/crm/deals?view=board`;

  return (
    <section aria-labelledby="pipeline-heading">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Pipeline</p>
          <h2 id="pipeline-heading" className="mt-1 text-[19px] font-semibold tracking-tight text-foreground">
            Sådan fordeler salget sig
          </h2>
        </div>
        {active.length > 0 && (
          <Link to={pipelineHref} className="shrink-0 text-[12.5px] font-medium text-primary hover:underline">
            Åbn pipeline →
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-2.5 w-full rounded-[4px]" />
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
      ) : active.length === 0 ? (
        <div className="rounded-[10px] bg-muted/40 px-5 py-5">
          <p className="text-[13.5px] text-foreground">Ingen deals i pipeline endnu.</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Opret den første deal for at se, hvordan salget bevæger sig gennem faserne.
          </p>
          <button
            onClick={() => navigate(`${base}/crm/deals?create=true`)}
            className="mt-3 text-[12.5px] font-medium text-primary hover:underline"
          >
            Opret første deal →
          </button>
        </div>
      ) : (
        <div>
          {worstStalled && (
            <div className="mb-4 flex items-start gap-2.5 rounded-[8px] bg-warning/10 px-4 py-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
              <p className="text-[12.5px] leading-snug text-foreground">
                {worstStalled.stalled} deal{worstStalled.stalled === 1 ? "" : "s"} i {worstStalled.name} har stået
                stille i over en uge.{" "}
                <button onClick={() => navigate(pipelineHref)} className="font-medium text-primary hover:underline">
                  Følg op →
                </button>
              </p>
            </div>
          )}

          <div className="flex h-2.5 w-full overflow-hidden rounded-[4px] bg-muted" role="img" aria-label="Fordeling af deals på faser">
            {active.map((s) => (
              <div
                key={s.name}
                style={{ width: `${((totalValue > 0 ? s.value : s.count) / (totalValue > 0 ? totalValue : totalCount)) * 100}%`, background: s.color }}
                title={s.name}
              />
            ))}
          </div>

          <ul className="mt-4">
            {active.map((s) => {
              const closed = /won|lost|vundet|tabt/i.test(s.name);
              const share = Math.round((s.count / totalCount) * 100);
              return (
                <li
                  key={s.name}
                  className={cn(
                    "grid grid-cols-[10px_1fr_auto] items-center gap-3 border-b border-border/40 py-2.5 text-[13px] last:border-0 sm:grid-cols-[10px_1fr_auto_auto]",
                    closed && "opacity-60",
                  )}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="truncate text-foreground/90">{s.name}</span>
                  <span className="hidden text-muted-foreground tabular-nums sm:inline">{share}%</span>
                  <span className="flex items-baseline gap-1.5 justify-self-end tabular-nums">
                    <span className="text-foreground/90">{format(s.value)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      · {s.count} deal{s.count === 1 ? "" : "s"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
