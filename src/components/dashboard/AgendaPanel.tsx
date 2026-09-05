import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { differenceInMinutes, format } from "date-fns";
import { da } from "date-fns/locale";

function AgendaShell({
  title,
  href,
  linkLabel,
  isLoading,
  emptyText,
  children,
  isEmpty,
}: {
  title: string;
  href: string;
  linkLabel: string;
  isLoading?: boolean;
  emptyText: string;
  children: React.ReactNode;
  isEmpty: boolean;
}) {
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[12.5px] font-semibold text-foreground">{title}</h3>
        <Link to={href} className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground hover:text-primary">
          {linkLabel}
        </Link>
      </div>
      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : isEmpty ? (
        <p className="text-[12.5px] text-muted-foreground/80">{emptyText}</p>
      ) : (
        <ul>{children}</ul>
      )}
    </section>
  );
}

export function MeetingsPanel({
  meetings,
  isLoading,
  base,
}: {
  meetings: { id: string; title: string; start_time: string; end_time: string }[];
  isLoading?: boolean;
  base: string;
}) {
  const now = Date.now();
  return (
    <AgendaShell
      title="Møder i dag"
      href={`${base}/work/calendar`}
      linkLabel="Åbn kalender"
      isLoading={isLoading}
      isEmpty={meetings.length === 0}
      emptyText="Ingen møder planlagt i dag."
    >
      {meetings.slice(0, 4).map((m) => {
        const start = new Date(m.start_time);
        const end = new Date(m.end_time);
        const live = now >= +start && now <= +end;
        const soon = !live && differenceInMinutes(start, now) <= 60 && differenceInMinutes(start, now) >= 0;
        return (
          <li key={m.id} className="flex items-center gap-3 border-b border-border/40 py-2.5 last:border-0">
            <span className="w-12 shrink-0 font-mono text-[12px] tabular-nums text-foreground/80">
              {format(start, "HH:mm")}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/90">{m.title}</span>
            {live && (
              <span className="shrink-0 text-[10.5px] font-medium uppercase tracking-[0.06em] text-primary">
                i gang
              </span>
            )}
            {soon && (
              <span className="shrink-0 text-[10.5px] text-muted-foreground">
                om {differenceInMinutes(start, now)} min
              </span>
            )}
          </li>
        );
      })}
    </AgendaShell>
  );
}

export function TasksPanel({
  tasks,
  isLoading,
  base,
}: {
  tasks: { id: string; title: string; due_date: string | null; priority: string | null }[];
  isLoading?: boolean;
  base: string;
}) {
  return (
    <AgendaShell
      title="Opgaver"
      href={`${base}/work/tasks`}
      linkLabel="Se alle"
      isLoading={isLoading}
      isEmpty={tasks.length === 0}
      emptyText="Ingen opgaver venter — godt klaret."
    >
      {tasks.slice(0, 4).map((t) => {
        const overdue = t.due_date ? new Date(t.due_date) < new Date() : false;
        const urgent = t.priority === "high" || overdue;
        return (
          <li key={t.id} className="flex items-center gap-3 border-b border-border/40 py-2.5 last:border-0">
            <span
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", urgent ? "bg-stamp dark:bg-warning" : "bg-muted-foreground/40")}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/90">{t.title}</span>
            <span className={cn("shrink-0 text-[11px] tabular-nums", overdue ? "text-stamp dark:text-warning" : "text-muted-foreground")}>
              {t.due_date ? format(new Date(t.due_date), "d. MMM", { locale: da }) : "uden frist"}
            </span>
          </li>
        );
      })}
    </AgendaShell>
  );
}
