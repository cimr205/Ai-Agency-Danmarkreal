import { useEffect, useState } from "react";
import { Clock, Play, Square } from "lucide-react";
import { useMyActiveSession, useClockIn, useClockOut } from "@/hooks/api/useWorkforce";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

function elapsed(checkIn: string): string {
  const ms = Date.now() - new Date(checkIn).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Masterprompt §30: Clock In is a high-frequency action and must not be
// buried inside HR — it lives here, in the persistent sidebar, right
// above the account menu. Reuses the same hooks TimeTrackingPage.tsx
// already uses, so this and the HR page always agree on active state.
export function ClockWidget() {
  const { data: session } = useMyActiveSession();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const [tick, setTick] = useState(0);

  const active = session && "id" in session && !session.check_out;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!session) return null;

  const handleClockIn = async () => {
    try {
      await clockIn.mutateAsync(session.employee_profile_id);
    } catch (err) {
      toast.error(getErrorMessage(err) || "Clock-in fejlede");
    }
  };

  const handleClockOut = async () => {
    if (!active || !("id" in session)) return;
    try {
      await clockOut.mutateAsync(session.id);
      toast.success("Arbejdsdag afsluttet");
    } catch (err) {
      toast.error(getErrorMessage(err) || "Clock-out fejlede");
    }
  };

  return (
    <div className="px-3 pb-2">
      <button
        type="button"
        onClick={active ? handleClockOut : handleClockIn}
        disabled={clockIn.isPending || clockOut.isPending}
        className={cn(
          "flex items-center gap-2.5 w-full rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
          active
            ? "bg-success/15 text-success hover:bg-success/25"
            : "bg-sidebar-accent text-sidebar-foreground/75 hover:text-sidebar-foreground",
        )}
      >
        {active ? <Square className="h-3.5 w-3.5 shrink-0" /> : <Play className="h-3.5 w-3.5 shrink-0" />}
        {active ? (
          <span className="flex-1 flex items-center justify-between font-mono tabular-nums">
            <span>Arbejder</span>
            <span key={tick}>{elapsed((session as { check_in: string }).check_in)}</span>
          </span>
        ) : (
          <span className="flex-1 flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> Clock in
          </span>
        )}
      </button>
    </div>
  );
}
