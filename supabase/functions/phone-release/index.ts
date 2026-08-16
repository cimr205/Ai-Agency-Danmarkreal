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

    const { id } = await req.json();
    if (!id) throw new Error("Missing provision id");

    // Fetch the provision record
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existing, error: fetchErr } = await serviceClient
      .from("phone_provisions")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) throw new Error("Provision not found");

    // Verify user belongs to same company
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();

    if (profile?.company_id !== existing.company_id) throw new Error("Unauthorized");

    const twilioSid = Deno.env.get("TWILIO_SID");
    const twilioToken = Deno.env.get("TWILIO_TOKEN");

    // Release from Twilio
    if (existing.twilio_sid && twilioSid && twilioToken) {
      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers/${existing.twilio_sid}.json`,
        {
          method: "DELETE",
          headers: {
            Authorization: "Basic " + btoa(`${twilioSid}:${twilioToken}`),
          },
        }
      );
      if (!twilioRes.ok && twilioRes.status !== 404) {
        const err = await twilioRes.text();
        throw new Error(`Twilio release error: ${err}`);
      }
    }

    // Delete from DB
    const { error: delErr } = await serviceClient
      .from("phone_provisions")
      .delete()
      .eq("id", id);

    if (delErr) throw new Error(`DB error: ${delErr.message}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
