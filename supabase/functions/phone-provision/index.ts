import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (authErr || !user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    if (!profile?.company_id) throw new Error("No company");

    const twilioSid = Deno.env.get("TWILIO_SID");
    const twilioToken = Deno.env.get("TWILIO_TOKEN");
    if (!twilioSid || !twilioToken) throw new Error("Twilio credentials not configured");

    const { areaCode } = await req.json().catch(() => ({ areaCode: "45" }));

    // Buy number from Twilio
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${twilioSid}:${twilioToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ AreaCode: areaCode }),
      }
    );

    if (!twilioRes.ok) {
      const err = await twilioRes.text();
      throw new Error(`Twilio error: ${err}`);
    }

    const twilioData = await twilioRes.json();

    // Store in DB using service role for insert
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: provision, error: dbErr } = await serviceClient
      .from("phone_provisions")
      .insert({
        company_id: profile.company_id,
        phone_number: twilioData.phone_number,
        twilio_sid: twilioData.sid,
      })
      .select()
      .single();

    if (dbErr) throw new Error(`DB error: ${dbErr.message}`);

    return new Response(JSON.stringify(provision), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
