import { withSentry } from "../_shared/sentry.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(withSentry("check-subscription", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("company_id")
      .eq("user_id", userData.user.id)
      .single();

    if (!profile?.company_id) {
      return new Response(JSON.stringify({ subscribed: false, status: "no_company" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company } = await supabaseClient
      .from("companies")
      .select("stripe_customer_id, stripe_subscription_id, trial_ends_at, seat_limit_trial, purchased_seats, subscription_status")
      .eq("id", profile.company_id)
      .single();

    if (!company?.stripe_customer_id) {
      return new Response(JSON.stringify({
        subscribed: false,
        status: company?.subscription_status || "none",
        trial_ends_at: company?.trial_ends_at,
        seat_limit: company?.seat_limit_trial || 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not configured");
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    // Explicit, admin-only seat-count confirmation — the only path that is
    // allowed to actually change what Stripe bills. Must come from a real
    // request body, not be inferred automatically.
    let body: { confirm_seat_sync?: boolean } = {};
    try { body = await req.clone().json(); } catch { /* GET-style poll, no body */ }
    if (body.confirm_seat_sync) {
      const { data: isAdmin } = await supabaseClient.rpc("is_company_admin", { _user_id: userData.user.id });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Only the company owner or admin can change seat count" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (company.stripe_subscription_id) {
        const sub = await stripe.subscriptions.retrieve(company.stripe_subscription_id);
        const { count } = await supabaseClient
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("company_id", profile.company_id);
        const activeUsers = count || 1;
        await stripe.subscriptions.update(sub.id, {
          items: [{ id: sub.items.data[0].id, quantity: activeUsers }],
        });
      }
    }

    // Check Stripe for current subscription status
    const subscriptions = await stripe.subscriptions.list({
      customer: company.stripe_customer_id,
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      await supabaseClient.from("companies").update({ subscription_status: "none" }).eq("id", profile.company_id);
      return new Response(JSON.stringify({ subscribed: false, status: "none" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sub = subscriptions.data[0];
    const status = sub.status; // trialing, active, past_due, canceled, etc.
    const isActive = ["trialing", "active"].includes(status);
    const currentQuantity = sub.items.data[0]?.quantity || 0;
    const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
    const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

    // Sync back to DB
    await supabaseClient.from("companies").update({
      stripe_subscription_id: sub.id,
      subscription_status: status,
      purchased_seats: status === "active" ? currentQuantity : company.purchased_seats,
      trial_ends_at: trialEnd || company.trial_ends_at,
    }).eq("id", profile.company_id);

    // Report (don't silently act on) a trial-ending seat mismatch: this
    // endpoint is called by any company member, including on a 60s poll —
    // it must stay read-only. Previously it called stripe.subscriptions
    // .update() here directly, which meant any employee's routine page
    // load could change what the company is billed, with no owner
    // approval and no role check. Surface the mismatch so the UI can
    // prompt an admin to confirm the seat-count change explicitly instead.
    let seatMismatch: { activeUsers: number; purchasedSeats: number } | null = null;
    if (status === "trialing" && sub.trial_end) {
      const trialEndDate = new Date(sub.trial_end * 1000);
      const now = new Date();
      const daysUntilEnd = (trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      if (daysUntilEnd <= 3) {
        const { count } = await supabaseClient
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("company_id", profile.company_id);

        const activeUsers = count || 1;
        if (activeUsers !== currentQuantity) {
          seatMismatch = { activeUsers, purchasedSeats: currentQuantity };
        }
      }
    }

    return new Response(JSON.stringify({
      subscribed: isActive,
      status,
      trial_ends_at: trialEnd,
      period_end: periodEnd,
      seat_limit: currentQuantity,
      purchased_seats: status === "active" ? currentQuantity : 0,
      seat_mismatch: seatMismatch,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CHECK-SUBSCRIPTION] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
}));
