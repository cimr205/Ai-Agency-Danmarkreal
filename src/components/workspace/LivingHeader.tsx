import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link, useParams } from "react-router-dom";
import { isLocale } from "@/lib/i18n";
import { useCurrency } from "@/contexts/CurrencyContext";

type DayMode = "morning" | "day" | "evening" | "night";

function getDayMode(): { mode: DayMode; greeting: string; whisper: string } {
  const h = new Date().getHours();
  if (h < 6)  return { mode: "night",   greeting: "Sent på dagen", whisper: "Det er stille. Brug tiden eftertænksomt." };
  if (h < 11) return { mode: "morning", greeting: "God morgen",    whisper: "Dagen er ny. Begynd roligt." };
  if (h < 14) return { mode: "day",     greeting: "Goddag",        whisper: "Hold momentum." };
  if (h < 18) return { mode: "day",     greeting: "Eftermiddag",   whisper: "De vigtige ting først." };
  return         { mode: "evening", greeting: "Godaften",     whisper: "Hvad blev færdigt i dag." };
}

function firstName(profile: { full_name?: string | null; email?: string | null } | null | undefined): string {
  const n = profile?.full_name?.split(" ")[0];
  if (n && /^[A-Za-zÀ-ÖØ-öø-ÿ]/.test(n)) return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
  const e = profile?.email?.split("@")[0]?.replace(/[0-9._-]+/g, " ").trim().split(/\s+/)[0];
  return e ? e.charAt(0).toUpperCase() + e.slice(1).toLowerCase() : "";
}

/**
 * A calm narrative header. No tiles, no cards.
 * One sentence describes the day; inline links carry weight.
 */
export function LivingHeader() {
  const { profile } = useAuth();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${locale}/app`;
  const { format } = useCurrency();

  const day = useMemo(getDayMode, []);

  const { data: pulse } = useQuery({
    queryKey: ["living-pulse", profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 60_000,
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);

      const [meetingsRes, tasksRes, dealsRes, invoicesRes] = await Promise.all([
        supabase.from("calendar_events").select("id,title,start_time")
          .eq("company_id", profile!.company_id)
          .gte("start_time", todayStart.toISOString()).lte("start_time", todayEnd.toISOString())
          .order("start_time", { ascending: true }).limit(5),
        supabase.from("tasks").select("id,title,due_date")
          .eq("company_id", profile!.company_id).neq("status", "completed")
          .lte("due_date", todayEnd.toISOString()).limit(20),
        supabase.from("deals").select("id,value,stage")
          .eq("company_id", profile!.company_id).not("stage", "in", "(won,lost)").limit(50),
        supabase.from("invoices").select("id,amount,status,due_date")
          .eq("company_id", profile!.company_id).neq("status", "paid").limit(50),
      ]);

      const overdue = (invoicesRes.data ?? []).filter(i => i.due_date && new Date(i.due_date) < new Date());
      const pipelineValue = (dealsRes.data ?? []).reduce((s, d) => s + Number(d.value || 0), 0);

      return {
        meetingCount: meetingsRes.data?.length ?? 0,
        firstMeeting: meetingsRes.data?.[0],
        taskCount: tasksRes.data?.length ?? 0,
        firstTask: tasksRes.data?.[0],
        overdueCount: overdue.length,
        overdueAmount: overdue.reduce((s, i) => s + Number(i.amount || 0), 0),
        pipelineValue,
      };
    },
  });

  const name = firstName(profile);

  // Build the narrative sentence from real signals — fall back gracefully.
  const fragments: { text: string; href?: string; tone?: "danger" }[] = [];
  if (pulse) {
    if (pulse.meetingCount > 0) {
      const meetingTime = pulse.firstMeeting?.start_time
        ? new Date(pulse.firstMeeting.start_time).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })
        : null;
      fragments.push({
        text: pulse.meetingCount === 1
          ? `ét møde${meetingTime ? ` kl. ${meetingTime}` : ""}`
          : `${pulse.meetingCount} møder${meetingTime ? `, første kl. ${meetingTime}` : ""}`,
        href: `${base}/work/calendar`,
      });
    }
    if (pulse.taskCount > 0) {
      fragments.push({
        text: pulse.taskCount === 1 ? "én opgave at lukke" : `${pulse.taskCount} opgaver at lukke`,
        href: `${base}/work/tasks`,
      });
    }
    if (pulse.overdueCount > 0) {
      fragments.push({
        text: `${pulse.overdueCount} forfalden faktura${pulse.overdueCount > 1 ? "er" : ""}${pulse.overdueAmount ? ` (${format(pulse.overdueAmount)})` : ""}`,
        href: `${base}/finance/invoices`,
        tone: "danger",
      });
    }
  }

  const dateLine = new Date().toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className="pt-2 pb-10 border-b border-border/30">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 mb-5">
        {dateLine}
      </div>

      <h1 className="font-display text-[32px] sm:text-[40px] leading-[1.05] tracking-tight text-foreground/95">
        {day.greeting}{name ? `, ${name}` : ""}.
      </h1>

      <p className="mt-4 text-[15px] sm:text-[16px] text-muted-foreground/85 leading-relaxed max-w-2xl">
        {fragments.length === 0 ? (
          <span>{day.whisper}</span>
        ) : (
          <>
            I dag venter{" "}
            {fragments.map((f, i) => (
              <span key={i}>
                {f.href ? (
                  <Link
                    to={f.href}
                    className={`underline decoration-dotted decoration-border underline-offset-4 transition-colors ${
                      f.tone === "danger" ? "text-destructive/90 hover:text-destructive" : "text-foreground/90 hover:text-foreground"
                    }`}
                  >
                    {f.text}
                  </Link>
                ) : (
                  <span className="text-foreground/90">{f.text}</span>
                )}
                {i < fragments.length - 2 ? ", " : i === fragments.length - 2 ? " og " : "."}
              </span>
            ))}
            {pulse && pulse.pipelineValue > 0 && (
              <>
                {" "}Pipeline står på{" "}
                <Link to={`${base}/crm/deals`} className="text-foreground/90 hover:text-foreground underline decoration-dotted decoration-border underline-offset-4">
                  {format(pulse.pipelineValue)}
                </Link>.
              </>
            )}
          </>
        )}
      </p>
    </section>
  );
}
