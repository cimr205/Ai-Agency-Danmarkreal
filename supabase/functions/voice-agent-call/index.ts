import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function twilioAuth(sid: string, token: string) {
  return "Basic " + btoa(`${sid}:${token}`);
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError("Missing auth", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (authErr || !user) return jsonError("Unauthorized", 401);

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    if (!profile?.company_id) return jsonError("No company", 400);

    const { agentId, toNumber, leadId } = await req.json();
    if (!agentId || !toNumber) return jsonError("Missing agentId or toNumber");

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load agent
    const { data: agent } = await serviceClient
      .from("voice_agents")
      .select("*")
      .eq("id", agentId)
      .eq("company_id", profile.company_id)
      .single();
    if (!agent) return jsonError("Agent not found");

    // ─── Resolve Twilio creds: tenant first, else platform ───
    const { data: tenantTwilio } = await serviceClient
      .from("twilio_accounts")
      .select("account_sid, auth_token")
      .eq("company_id", profile.company_id)
      .single();

    let twilioSid = tenantTwilio?.account_sid;
    let twilioToken = tenantTwilio?.auth_token;
    let usingPlatformCreds = false;

    if (!twilioSid || !twilioToken) {
      const platformSid = Deno.env.get("TWILIO_SID");
      const platformToken = Deno.env.get("TWILIO_TOKEN");
      if (platformSid && platformToken) {
        twilioSid = platformSid;
        twilioToken = platformToken;
        usingPlatformCreds = true;
      }
    }

    if (!twilioSid || !twilioToken) {
      return jsonError("Twilio not connected. Connect Twilio in Power Dialer first.");
    }

    // ─── Resolve from-number: prefer phone_provisions (shared with Power Dialer), else Twilio API ───
    let fromNumber: string | null = null;

    if (!usingPlatformCreds) {
      const { data: provision } = await serviceClient
        .from("phone_provisions")
        .select("phone_number")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (provision?.phone_number) fromNumber = provision.phone_number;
    }

    if (!fromNumber) {
      const numRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers.json?PageSize=1`,
        { headers: { Authorization: twilioAuth(twilioSid, twilioToken) } },
      );
      if (!numRes.ok) {
        const errText = await numRes.text();
        return jsonError(`Could not load Twilio phone numbers: ${errText.slice(0, 200)}`);
      }
      const numData = await numRes.json();
      fromNumber = numData?.incoming_phone_numbers?.[0]?.phone_number ?? null;
    }

    if (!fromNumber) {
      return jsonError(
        "No phone number provisioned. Buy a number in Power Dialer first.",
      );
    }

    // Create voice_calls row
    const { data: callRow, error: callErr } = await serviceClient
      .from("voice_calls")
      .insert({
        company_id: profile.company_id,
        agent_id: agentId,
        lead_id: leadId || null,
        to_number: toNumber,
        from_number: fromNumber,
        status: "queued",
        created_by: user.id,
      })
      .select()
      .single();
    if (callErr || !callRow) return jsonError(callErr?.message || "Failed to create call row");

    const baseUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
    const twimlUrl = `${baseUrl}/voice-agent-twiml?call_id=${callRow.id}`;
    const statusUrl = `${baseUrl}/voice-agent-status?call_id=${callRow.id}`;

    // Initiate call
    const params = new URLSearchParams({
      To: toNumber,
      From: fromNumber,
      Url: twimlUrl,
      StatusCallback: statusUrl,
      StatusCallbackEvent: "initiated ringing answered completed",
      StatusCallbackMethod: "POST",
      Record: "true",
      RecordingStatusCallback: statusUrl,
    });

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: twilioAuth(twilioSid, twilioToken),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    const twilioData = await twilioRes.json();
    if (!twilioRes.ok) {
      await serviceClient.from("voice_calls").update({ status: "failed" }).eq("id", callRow.id);
      return jsonError(`Twilio error: ${twilioData.message || JSON.stringify(twilioData)}`);
    }

    await serviceClient
      .from("voice_calls")
      .update({
        twilio_call_sid: twilioData.sid,
        status: "initiated",
        started_at: new Date().toISOString(),
      })
      .eq("id", callRow.id);

    await serviceClient.from("voice_call_events").insert({
      call_id: callRow.id,
      company_id: profile.company_id,
      event_type: "initiated",
      speaker: "system",
      content: `Call initiated to ${toNumber}`,
      metadata: { using_platform_creds: usingPlatformCreds },
    });

    return new Response(
      JSON.stringify({ success: true, callId: callRow.id, twilioSid: twilioData.sid }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("voice-agent-call error:", e);
    return jsonError(e instanceof Error ? e.message : "Unknown error");
  }
});
