import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
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

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });

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

    // If trial is about to end, count active users and update quantity
    if (status === "trialing" && sub.trial_end) {
      const trialEndDate = new Date(sub.trial_end * 1000);
      const now = new Date();
      const daysUntilEnd = (trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      if (daysUntilEnd <= 3) {
        // Count active users in the company
        const { count } = await supabaseClient
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("company_id", profile.company_id);

        const activeUsers = count || 1;
        if (activeUsers !== currentQuantity) {
          await stripe.subscriptions.update(sub.id, {
            items: [{ id: sub.items.data[0].id, quantity: activeUsers }],
          });
          console.log(`[CHECK-SUB] Updated quantity from ${currentQuantity} to ${activeUsers}`);
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
});
