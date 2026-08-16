import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public endpoint (no JWT) — Twilio fetches this for the initial TwiML.
// Returns greeting + opens a <Gather speech> loop that posts user transcripts
// to /voice-agent-respond, which generates the AI reply.

const FUNCTIONS_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function languageFor(code?: string | null) {
  const lang = code === "da" ? "da-DK" : code === "de" ? "de-DE" : "en-US";
  const voice = lang === "da-DK" ? "Polly.Naja" : lang === "de-DE" ? "Polly.Marlene" : "Polly.Joanna";
  return { lang, voice };
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get("call_id");
    if (!callId) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Missing call ID.</Say><Hangup/></Response>`,
        { headers: { "Content-Type": "text/xml" } },
      );
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: call } = await serviceClient
      .from("voice_calls")
      .select("agent_id, company_id")
      .eq("id", callId)
      .single();

    if (!call) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Call not found.</Say><Hangup/></Response>`,
        { headers: { "Content-Type": "text/xml" } },
      );
    }

    const { data: agent } = await serviceClient
      .from("voice_agents")
      .select("greeting, language")
      .eq("id", call.agent_id)
      .single();

    const greeting = agent?.greeting || "Hello, this is an AI assistant calling. How are you today?";
    const { lang, voice } = languageFor(agent?.language);

    // Log greeting as the agent's first turn
    await serviceClient.from("voice_call_events").insert({
      call_id: callId,
      company_id: call.company_id,
      event_type: "transcript",
      speaker: "agent",
      content: greeting,
    });

    const respondUrl = `${FUNCTIONS_BASE}/voice-agent-respond?call_id=${callId}`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${lang}">${escapeXml(greeting)}</Say>
  <Gather input="speech"
          language="${lang}"
          speechTimeout="auto"
          timeout="6"
          action="${respondUrl}"
          method="POST">
  </Gather>
  <Say voice="${voice}" language="${lang}">I didn't catch that. Goodbye.</Say>
  <Hangup/>
</Response>`;

    return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
  } catch (e) {
    console.error("voice-agent-twiml error:", e);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred.</Say><Hangup/></Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  }
});
