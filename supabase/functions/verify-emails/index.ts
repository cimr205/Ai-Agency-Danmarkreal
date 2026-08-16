import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ReacherResult {
  input: string;
  is_reachable: "safe" | "risky" | "invalid" | "unknown";
  misc: { is_disposable: boolean; is_role_account: boolean };
  mx: { accepts_mail: boolean; records: string[] };
  smtp: { can_connect_smtp: boolean; has_full_inbox: boolean; is_catch_all: boolean; is_deliverable: boolean; is_disabled: boolean };
  syntax: { is_valid_syntax: boolean; domain: string; username: string };
}

async function verifyWithReacher(email: string, reacherUrl: string, signal?: AbortSignal): Promise<{ valid: boolean; reason: string; details?: Partial<ReacherResult> }> {
  try {
    const controller = new AbortController();
    const perEmailTimeout = setTimeout(() => controller.abort(), 5000);
    if (signal) signal.addEventListener('abort', () => controller.abort());
    const res = await fetch(`${reacherUrl}/v0/check_email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_email: email }),
      signal: controller.signal,
    });
    clearTimeout(perEmailTimeout);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Reacher error for ${email}: ${res.status} ${errText}`);
      return { valid: false, reason: `Reacher error: ${res.status}` };
    }

    const data: ReacherResult = await res.json();

    if (!data.syntax.is_valid_syntax) {
      return { valid: false, reason: "Invalid syntax", details: data };
    }
    if (data.misc.is_disposable) {
      return { valid: false, reason: "Disposable email", details: data };
    }
    if (data.is_reachable === "safe") {
      return { valid: true, reason: "Verified (SMTP safe)", details: data };
    }
    if (data.is_reachable === "risky") {
      const reasons: string[] = [];
      if (data.smtp.is_catch_all) reasons.push("catch-all");
      if (data.smtp.has_full_inbox) reasons.push("full inbox");
      if (data.misc.is_role_account) reasons.push("role account");
      return { valid: true, reason: `Risky (${reasons.join(", ") || "unknown reason"})`, details: data };
    }
    if (data.is_reachable === "invalid") {
      return { valid: false, reason: data.smtp.is_disabled ? "Mailbox disabled" : "Invalid mailbox", details: data };
    }
    // unknown
    return { valid: false, reason: "Unknown reachability", details: data };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { valid: false, reason: "Timeout (5s)" };
    }
    console.error(`Reacher fetch error for ${email}:`, err);
    return { valid: false, reason: "Verification service error" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { emails } = await req.json();
    if (!Array.isArray(emails) || emails.length === 0) {
      return new Response(JSON.stringify({ error: "emails array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const reacherUrl = Deno.env.get("REACHER_API_URL");
    if (!reacherUrl) {
      return new Response(JSON.stringify({ error: "REACHER_API_URL not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Process in batches of 10 with a global 55s deadline
    const results: Array<{ email: string; valid: boolean; reason: string; is_reachable?: string; status: "verified" | "invalid" | "unverified" }> = [];
    const deadline = Date.now() + 55000;
    const globalAbort = new AbortController();

    for (let i = 0; i < emails.length; i += 20) {
      if (Date.now() >= deadline) {
        // Mark remaining emails as unverified (not invalid)
        for (let j = i; j < emails.length; j++) {
          results.push({ email: emails[j], valid: true, reason: "Skipped (timeout)", is_reachable: "unknown", status: "unverified" });
        }
        break;
      }
      const batch = emails.slice(i, i + 20);
      const batchResults = await Promise.all(
        batch.map(async (email: string) => {
          const r = await verifyWithReacher(email, reacherUrl, globalAbort.signal);
          // If verification failed due to infrastructure (timeout, service error), treat as unverified not invalid
          const isInfraFailure = r.reason.includes("Timeout") || r.reason.includes("service error") || r.reason.includes("Reacher error");
          const status = isInfraFailure ? "unverified" as const : (r.valid ? "verified" as const : "invalid" as const);
          return {
            email,
            valid: isInfraFailure ? true : r.valid, // Don't block sending for infra failures
            reason: r.reason,
            is_reachable: r.details?.is_reachable || "unknown",
            status,
          };
        })
      );
      results.push(...batchResults);
    }

    const verifiedCount = results.filter(r => r.status === "verified").length;
    const invalidCount = results.filter(r => r.status === "invalid").length;
    const unverifiedCount = results.filter(r => r.status === "unverified").length;

    return new Response(JSON.stringify({
      results,
      summary: { total: results.length, valid: verifiedCount, invalid: invalidCount, unverified: unverifiedCount },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("verify-emails error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
