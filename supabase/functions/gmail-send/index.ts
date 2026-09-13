import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = claimsData.claims.sub;

    const body = await req.json();
    const { to, subject, message, cc, reply_to_message_id, attachments, html, customer_id, deal_id } = body;

    if (!to || !subject || !message) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, subject, message" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If html is provided use it directly; otherwise convert plain text to HTML
    const htmlBody = html ? html : `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222;">${message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')}</body></html>`;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get email account
    const { data: account } = await supabaseAdmin
      .from("email_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "gmail")
      .eq("status", "connected")
      .single();

    if (!account) {
      return new Response(JSON.stringify({ error: "No Gmail account connected" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Refresh if needed
    let accessToken = account.access_token;
    if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
      const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
      const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: account.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const refreshData = await refreshRes.json();
      if (refreshData.error) throw new Error("Token refresh failed");
      accessToken = refreshData.access_token;

      await supabaseAdmin.from("email_accounts").update({
        access_token: accessToken,
        token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
      }).eq("id", account.id);
    }

    // Helper: UTF-8 safe base64url encoding for Gmail API
    function utf8ToBase64url(str: string): string {
      const bytes = new TextEncoder().encode(str);
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    // Helper: encode subject with UTF-8 B-encoding
    function encodeSubject(s: string): string {
      const bytes = new TextEncoder().encode(s);
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return `=?UTF-8?B?${btoa(binary)}?=`;
    }

    let parent: { thread_id: string | null; internet_message_id: string | null; reference_ids: string[] | null; contact_id: string | null; deal_id: string | null } | null = null;
    if (reply_to_message_id) {
      const { data } = await supabaseAdmin.from("emails")
        .select("thread_id,internet_message_id,reference_ids,contact_id,deal_id")
        .eq("company_id", account.company_id).eq("email_account_id", account.id)
        .or(`id.eq.${reply_to_message_id},gmail_id.eq.${reply_to_message_id}`).maybeSingle();
      parent = data;
      if (!parent) return new Response(JSON.stringify({ error: "Reply target was not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let linkedContactId: string | null = parent?.contact_id ?? null;
    let linkedDealId: string | null = parent?.deal_id ?? null;
    if (customer_id) {
      const { data } = await supabaseAdmin.from("customers").select("id").eq("id", customer_id).eq("company_id", account.company_id).maybeSingle();
      if (!data) return new Response(JSON.stringify({ error: "Customer does not belong to workspace" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      linkedContactId = data.id;
    }
    if (deal_id) {
      const { data } = await supabaseAdmin.from("deals").select("id,customer_id").eq("id", deal_id).eq("company_id", account.company_id).maybeSingle();
      if (!data || (linkedContactId && data.customer_id !== linkedContactId)) return new Response(JSON.stringify({ error: "Deal does not match workspace/customer" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      linkedDealId = data.id;
      linkedContactId = linkedContactId ?? data.customer_id;
    }
    const internetMessageId = `<${crypto.randomUUID()}@aiagencydanmark.local>`;
    const references = [...(parent?.reference_ids ?? []), ...(parent?.internet_message_id ? [parent.internet_message_id] : [])];
    const continuityHeaders = [
      `Message-ID: ${internetMessageId}`,
      ...(parent?.internet_message_id ? [`In-Reply-To: ${parent.internet_message_id}`] : []),
      ...(references.length ? [`References: ${references.join(" ")}`] : []),
    ];

    // Build RFC 2822 email
    let rawEmail: string;
    const hasAttachments = attachments && Array.isArray(attachments) && attachments.length > 0;

    if (hasAttachments) {
      const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const parts: string[] = [
        `From: ${account.email_address}`,
        `To: ${to}`,
        ...(cc ? [`Cc: ${cc}`] : []),
        `Subject: ${encodeSubject(subject)}`,
        ...continuityHeaders,
        "MIME-Version: 1.0",
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        htmlBody,
      ];

      for (const att of attachments) {
        parts.push(
          `--${boundary}`,
          `Content-Type: ${att.content_type}; name="${att.filename}"`,
          `Content-Disposition: attachment; filename="${att.filename}"`,
          "Content-Transfer-Encoding: base64",
          "",
          att.data
        );
      }
      parts.push(`--${boundary}--`);
      rawEmail = parts.join("\r\n");
    } else {
      const emailLines = [
        `From: ${account.email_address}`,
        `To: ${to}`,
        ...(cc ? [`Cc: ${cc}`] : []),
        `Subject: ${encodeSubject(subject)}`,
        ...continuityHeaders,
        "MIME-Version: 1.0",
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        htmlBody,
      ];
      rawEmail = emailLines.join("\r\n");
    }
    const encodedEmail = utf8ToBase64url(rawEmail);

    const sendUrl = reply_to_message_id
      ? `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`
      : `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`;

    const sendBody: { raw: string; threadId?: string } = { raw: encodedEmail };
    if (reply_to_message_id) {
      if (parent?.thread_id) sendBody.threadId = parent.thread_id;
    }

    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendBody),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      console.error("Gmail send error:", sendRes.status, errText);
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sendData = await sendRes.json();

    const { error: persistError } = await supabaseAdmin.from("emails").upsert({
      email_account_id: account.id, company_id: account.company_id, user_id: userId,
      gmail_id: sendData.id, provider_message_id: sendData.id, thread_id: sendData.threadId ?? parent?.thread_id ?? null,
      internet_message_id: internetMessageId, in_reply_to: parent?.internet_message_id ?? null, reference_ids: references,
      from_address: account.email_address, from_name: account.email_address, to_addresses: [to], cc_addresses: cc ? [cc] : [],
      subject, snippet: message.slice(0, 240), body_text: message.slice(0, 10000), body_html: htmlBody.slice(0, 50000),
      labels: ["SENT"], is_read: true, direction: "outbound", routing_status: linkedContactId ? "matched" : "unmatched",
      contact_id: linkedContactId, deal_id: linkedDealId, received_at: new Date().toISOString(),
    }, { onConflict: "email_account_id,gmail_id" });
    if (persistError) {
      console.error("Outbound email persistence failed", persistError);
      return new Response(JSON.stringify({ error: "Email sent but continuity persistence failed", message_id: sendData.id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, message_id: sendData.id, thread_id: sendData.threadId ?? parent?.thread_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("gmail-send error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
