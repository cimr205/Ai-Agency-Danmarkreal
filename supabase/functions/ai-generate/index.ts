import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace(/^Bearer\s+/i, "");

    const userClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await userClient
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "No company associated" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { prompt, generation_type = "image", negative_prompt, reference_image } = await req.json();
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Prompt is required (min 3 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startTime = Date.now();
    const model = "google/gemini-2.5-flash-image";

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: genRecord, error: insertError } = await adminClient
      .from("ai_generations")
      .insert({
        company_id: profile.company_id,
        user_id: user.id,
        generation_type,
        prompt: prompt.trim(),
        negative_prompt: negative_prompt || null,
        model_used: model,
        status: "processing",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create generation record" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const genId = genRecord.id;

    const LOVABLE_API_KEY = (Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) {
      await adminClient.from("ai_generations").update({
        status: "failed", error_message: "AI service not configured",
        completed_at: new Date().toISOString(),
      }).eq("id", genId);
      throw new Error("LOVABLE_API_KEY not configured");
    }

    let enhancedPrompt = prompt.trim();
    if (generation_type === "ad_creative") {
      enhancedPrompt = `Professional marketing advertisement: ${enhancedPrompt}. High quality, commercial grade, clean design, modern style.`;
    }

    // Build message content - support reference image for editing
    let messageContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    if (reference_image && typeof reference_image === "string" && reference_image.startsWith("data:")) {
      // Multimodal: text + image for editing
      messageContent = [
        { type: "text", text: enhancedPrompt },
        { type: "image_url", image_url: { url: reference_image } },
      ];
    } else if (reference_image && typeof reference_image === "string" && reference_image.startsWith("http")) {
      messageContent = [
        { type: "text", text: enhancedPrompt },
        { type: "image_url", image_url: { url: reference_image } },
      ];
    } else {
      messageContent = enhancedPrompt;
    }

    const aiResponse = await fetch((Deno.env.get("AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: messageContent }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResponse.ok) {
      const errStatus = aiResponse.status;
      let errMsg = "AI generation failed";
      if (errStatus === 429) errMsg = "Rate limit nået, prøv igen om lidt.";
      if (errStatus === 402) errMsg = "Credits opbrugt.";

      await adminClient.from("ai_generations").update({
        status: "failed", error_message: errMsg,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      }).eq("id", genId);

      return new Response(JSON.stringify({ error: errMsg }), {
        status: errStatus, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResponse.json();
    const imageData = aiResult.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      await adminClient.from("ai_generations").update({
        status: "failed",
        error_message: "No image returned from AI model",
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      }).eq("id", genId);

      return new Response(JSON.stringify({ error: "No image generated" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload image to storage
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const filePath = `${profile.company_id}/${genId}.png`;

    const { error: uploadError } = await adminClient.storage
      .from("ai-media")
      .upload(filePath, binaryData, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      await adminClient.from("ai_generations").update({
        status: "completed",
        output_url: imageData,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      }).eq("id", genId);

      return new Response(JSON.stringify({
        id: genId, status: "completed", output_url: imageData,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: publicUrlData } = adminClient.storage
      .from("ai-media")
      .getPublicUrl(filePath);

    const outputUrl = publicUrlData.publicUrl;

    await adminClient.from("ai_generations").update({
      status: "completed",
      output_url: outputUrl,
      output_storage_path: filePath,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    }).eq("id", genId);

    return new Response(JSON.stringify({
      id: genId,
      status: "completed",
      output_url: outputUrl,
      duration_ms: Date.now() - startTime,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("ai-generate error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
