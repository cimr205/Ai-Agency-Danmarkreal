import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCompanyAI } from "../_shared/aiConnection.ts";

// Public endpoint (no JWT). Twilio posts the user's speech transcript here
// after each <Gather>. We call OpenAI Chat with full conversation history,
// then return TwiML that speaks the AI reply and re-opens <Gather>.

const FUNCTIONS_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
const MAX_TURNS = 30; // Hard cap to prevent runaway calls

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

function hangupTwiml(message: string, voice: string, lang: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${lang}">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const callId = url.searchParams.get("call_id");

  // Pre-parse fallback voice/lang in case we error out
  let voice = "Polly.Joanna";
  let lang = "en-US";

  try {
    if (!callId) {
      return new Response(hangupTwiml("Missing call ID.", voice, lang), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const formData = await req.formData();
    const userTranscript = String(formData.get("SpeechResult") || "").trim();
    const confidence = parseFloat(String(formData.get("Confidence") || "0"));

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
      return new Response(hangupTwiml("Call not found.", voice, lang), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const { data: agent } = await serviceClient
      .from("voice_agents")
      .select("system_prompt, greeting, language, max_duration_seconds")
      .eq("id", call.agent_id)
      .single();

    ({ lang, voice } = languageFor(agent?.language));
    const respondUrl = `${FUNCTIONS_BASE}/voice-agent-respond?call_id=${callId}`;

    // If user said nothing, give them one more shot then hang up
    if (!userTranscript) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="${lang}" speechTimeout="auto" timeout="6" action="${respondUrl}" method="POST">
    <Say voice="${voice}" language="${lang}">Are you still there?</Say>
  </Gather>
  <Say voice="${voice}" language="${lang}">Thank you for your time. Goodbye.</Say>
  <Hangup/>
</Response>`,
        { headers: { "Content-Type": "text/xml" } },
      );
    }

    // Log user turn
    await serviceClient.from("voice_call_events").insert({
      call_id: callId,
      company_id: call.company_id,
      event_type: "transcript",
      speaker: "lead",
      content: userTranscript,
      metadata: { confidence },
    });

    // Pull conversation history (greeting + all turns so far)
    const { data: events } = await serviceClient
      .from("voice_call_events")
      .select("speaker, content, created_at")
      .eq("call_id", callId)
      .eq("event_type", "transcript")
      .order("created_at", { ascending: true })
      .limit(MAX_TURNS * 2 + 4);

    // Hard cap to prevent infinite calls
    const turnCount = (events || []).filter((e) => e.speaker === "lead").length;
    if (turnCount >= MAX_TURNS) {
      return new Response(
        hangupTwiml("Thank you for your time. Have a great day. Goodbye.", voice, lang),
        { headers: { "Content-Type": "text/xml" } },
      );
    }

    // Resolve the tenant's own connected AI provider — same table/edge
    // function every other AI feature in the app uses.
    const ai = await getCompanyAI(serviceClient, call.company_id);
    if (!ai) {
      return new Response(
        hangupTwiml("AI service is not configured. Goodbye.", voice, lang),
        { headers: { "Content-Type": "text/xml" } },
      );
    }

    const systemPrompt =
      agent?.system_prompt ||
      "You are a friendly AI sales assistant on a phone call. Keep replies SHORT (1-2 sentences max). Speak naturally. If the user wants to end the call, politely say goodbye.";

    const messages: Array<{ role: string; content: string }> = [
      {
        role: "system",
        content: `${systemPrompt}\n\nIMPORTANT: You are on a live phone call. Reply in 1-2 short sentences. Never use markdown, bullet points, or lists. Just spoken words.`,
      },
      ...(events || []).map((e) => ({
        role: e.speaker === "agent" ? "assistant" : "user",
        content: e.content || "",
      })),
    ];

    let aiReply = "I'm sorry, I didn't catch that. Could you repeat?";
    let shouldHangup = false;

    try {
      const aiRes = await fetch(ai.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ai.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ai.model,
          messages,
          max_tokens: 120,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const reply = aiData.choices?.[0]?.message?.content?.trim();
        if (reply) {
          aiReply = reply;
          // Detect natural goodbye
          if (/\b(goodbye|farvel|tschüss|have a (great|nice|good) (day|one)|talk (to you )?later)\b/i.test(reply)) {
            shouldHangup = true;
          }
        }
      } else {
        console.error("voice-agent-respond AI error:", aiRes.status, await aiRes.text());
      }
    } catch (aiErr) {
      console.error("voice-agent-respond AI exception:", aiErr);
    }

    // Log agent turn
    await serviceClient.from("voice_call_events").insert({
      call_id: callId,
      company_id: call.company_id,
      event_type: "transcript",
      speaker: "agent",
      content: aiReply,
    });

    if (shouldHangup) {
      return new Response(hangupTwiml(aiReply, voice, lang), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${lang}">${escapeXml(aiReply)}</Say>
  <Gather input="speech" language="${lang}" speechTimeout="auto" timeout="6" action="${respondUrl}" method="POST">
  </Gather>
  <Say voice="${voice}" language="${lang}">Are you still there? Goodbye.</Say>
  <Hangup/>
</Response>`;

    return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
  } catch (e) {
    console.error("voice-agent-respond fatal error:", e);
    return new Response(hangupTwiml("Sorry, an error occurred. Goodbye.", voice, lang), {
      headers: { "Content-Type": "text/xml" },
    });
  }
});
