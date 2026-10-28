import { withSentry } from "../_shared/sentry.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Canonical full-suite seat price — single source of truth, mirrors create-checkout.
// The amount itself lives in Stripe; this endpoint only reads it so the UI never
// hardcodes a number.
const PRICE_ID_DKK = "price_1TIWHDRmhuA1UO2DtPQydBJs";
const PRICE_ID_USD = "price_1TRI6CRmhuA1UO2DFwPscuN5";

serve(withSentry("get-pricing", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const rawCurrency = (body?.currency || url.searchParams.get("currency") || "dkk").toString().toLowerCase();
    const currency = rawCurrency === "usd" ? "usd" : "dkk";
    const priceId = currency === "usd" ? PRICE_ID_USD : PRICE_ID_DKK;

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not configured");
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    const price = await stripe.prices.retrieve(priceId);
    const amount = typeof price.unit_amount === "number" ? price.unit_amount / 100 : null;

    return new Response(
      JSON.stringify({
        price_id: price.id,
        amount,                                   // e.g. 499
        currency: (price.currency || currency).toUpperCase(), // e.g. "DKK"
        interval: price.recurring?.interval ?? "month",       // e.g. "month"
        per: "seat",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[GET-PRICING] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
}));
