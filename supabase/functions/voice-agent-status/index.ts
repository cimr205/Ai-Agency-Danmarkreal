import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public endpoint - Twilio status callbacks (no JWT verification).
// Receives both call status updates and recording status callbacks.

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get("call_id");
    if (!callId) return new Response("missing call id", { status: 400 });

    const formData = await req.formData();
    const params: Record<string, string> = {};
    formData.forEach((v, k) => { params[k] = String(v); });

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: call } = await serviceClient
      .from("voice_calls")
      .select("company_id, status")
      .eq("id", callId)
      .single();
    if (!call) return new Response("call not found", { status: 404 });

    // Recording callback
    if (params.RecordingUrl) {
      const recordingUrl = `${params.RecordingUrl}.mp3`;
      await serviceClient.from("voice_calls").update({
        recording_url: recordingUrl,
        duration_seconds: parseInt(params.RecordingDuration || "0", 10),
      }).eq("id", callId);

      await serviceClient.from("voice_call_events").insert({
        call_id: callId,
        company_id: call.company_id,
        event_type: "recording_ready",
        speaker: "system",
        content: `Recording available (${params.RecordingDuration}s)`,
        metadata: { recording_url: recordingUrl, recording_sid: params.RecordingSid },
      });

      // Trigger transcription (fire-and-forget)
      transcribeRecording(serviceClient, callId, call.company_id, recordingUrl).catch(console.error);

      return new Response("ok");
    }

    // Call status update
    const callStatus = params.CallStatus; // queued, ringing, in-progress, completed, failed, busy, no-answer
    if (callStatus) {
      const updates: Record<string, unknown> = { status: callStatus };
      if (callStatus === "completed" || callStatus === "failed" || callStatus === "busy" || callStatus === "no-answer") {
        updates.ended_at = new Date().toISOString();
        if (params.CallDuration) updates.duration_seconds = parseInt(params.CallDuration, 10);
      }

      await serviceClient.from("voice_calls").update(updates).eq("id", callId);

      await serviceClient.from("voice_call_events").insert({
        call_id: callId,
        company_id: call.company_id,
        event_type: "status",
        speaker: "system",
        content: `Status: ${callStatus}`,
        metadata: { duration: params.CallDuration },
      });
    }

    return new Response("ok");
  } catch (e) {
    console.error("voice-agent-status error:", e);
    return new Response("error", { status: 500 });
  }
});

async function transcribeRecording(serviceClient: SupabaseClient, callId: string, companyId: string, recordingUrl: string) {
  try {
    // Whisper transcription required an OpenAI key (openai_accounts table),
    // removed per the approved AI stack (Ollama/llama.cpp only — no hosted
    // LLM APIs). There is no self-hosted speech-to-text service in this
    // stack today, so recording transcription is disabled rather than
    // silently querying a table that no longer exists. Revisit if/when a
    // self-hosted STT service (e.g. whisper.cpp) is added.
    console.log("transcribeRecording: disabled — no self-hosted speech-to-text service configured");
    return;

    // Get twilio creds (tenant first, else platform)
    const { data: tenantTwilio } = await serviceClient
      .from("twilio_accounts")
      .select("account_sid, auth_token")
      .eq("company_id", companyId)
      .single();

    const twilio = tenantTwilio ?? {
      account_sid: Deno.env.get("TWILIO_SID"),
      auth_token: Deno.env.get("TWILIO_TOKEN"),
    };
    if (!twilio.account_sid || !twilio.auth_token) return;

    const audioRes = await fetch(recordingUrl, {
      headers: { Authorization: "Basic " + btoa(`${twilio.account_sid}:${twilio.auth_token}`) },
    });
    if (!audioRes.ok) {
      console.error("Failed to download recording:", audioRes.status);
      return;
    }
    const audioBlob = await audioRes.blob();

    const fd = new FormData();
    fd.append("file", audioBlob, "recording.mp3");
    fd.append("model", "whisper-1");

    const transRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openai.api_key}` },
      body: fd,
    });

    if (!transRes.ok) {
      const err = await transRes.text();
      console.error("Whisper failed:", err);
      return;
    }

    const transData = await transRes.json();
    const transcript = transData.text || "";

    await serviceClient.from("voice_calls").update({ summary: transcript.slice(0, 500) }).eq("id", callId);
    await serviceClient.from("voice_call_events").insert({
      call_id: callId,
      company_id: companyId,
      event_type: "transcript",
      speaker: "lead",
      content: transcript,
    });
  } catch (e) {
    console.error("transcribeRecording error:", e);
  }
}
