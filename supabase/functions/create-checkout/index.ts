import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRICE_ID_DKK = "price_1TIWHDRmhuA1UO2DtPQydBJs";
const PRICE_ID_USD = "price_1TRI6CRmhuA1UO2DFwPscuN5";

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
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user?.email) throw new Error("Not authenticated");

    const user = userData.user;

    // Get company info for seat limit
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();

    if (!profile?.company_id) throw new Error("No company found");

    const { data: company } = await supabaseClient
      .from("companies")
      .select("id, name, seat_limit_trial, stripe_customer_id, stripe_subscription_id")
      .eq("id", profile.company_id)
      .single();

    if (!company) throw new Error("Company not found");

    // If already has subscription, redirect to portal instead
    if (company.stripe_subscription_id) {
      throw new Error("Company already has a subscription");
    }

    const body = await req.json().catch(() => ({}));
    const seatLimit = body.seat_limit || company.seat_limit_trial || 5;
    const currency = (body.currency || "dkk").toLowerCase() === "usd" ? "usd" : "dkk";
    const locale = body.locale === "en" ? "en" : "da";
    const priceId = currency === "usd" ? PRICE_ID_USD : PRICE_ID_DKK;

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });

    // Find or create customer
    let customerId = company.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: company.name,
        metadata: { company_id: company.id, user_id: user.id },
      });
      customerId = customer.id;

      // Save customer ID to company
      await supabaseClient
        .from("companies")
        .update({ stripe_customer_id: customerId })
        .eq("id", company.id);
    }

    const origin = req.headers.get("origin") || "https://bridge-orbit-core.lovable.app";

    // Create checkout session with 14-day trial
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: seatLimit }],
      mode: "subscription",
      payment_method_collection: "always",
      locale: locale === "en" ? "en" : "da",
      subscription_data: {
        trial_period_days: 14,
        metadata: { company_id: company.id, currency },
      },
      success_url: `${origin}/${locale}/app/dashboard?subscription=success`,
      cancel_url: `${origin}/${locale}/app/onboarding?subscription=cancelled`,
    });

    // Update company with trial info
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 14);

    await supabaseClient
      .from("companies")
      .update({
        seat_limit_trial: seatLimit,
        trial_ends_at: trialEnds.toISOString(),
        subscription_status: "trialing",
      })
      .eq("id", company.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-CHECKOUT] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
