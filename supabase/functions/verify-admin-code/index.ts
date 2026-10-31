import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();

    if (!code || typeof code !== "string") {
      return new Response(JSON.stringify({ valid: false, error: "Kode mangler" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminCode = Deno.env.get("ADMIN_ACCESS_CODE");
    if (!adminCode) {
      console.error("ADMIN_ACCESS_CODE secret not configured");
      return new Response(JSON.stringify({ valid: false, error: "System fejl" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const valid = code.trim() === adminCode.trim();

    return new Response(JSON.stringify({ valid }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ valid: false, error: "Ugyldig anmodning" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
