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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = user.id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get email account
    const { data: account, error: accErr } = await supabaseAdmin
      .from("email_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "gmail")
      .eq("status", "connected")
      .single();

    if (accErr || !account) {
      return new Response(JSON.stringify({ error: "No Gmail account connected" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Refresh token if expired
    let accessToken = account.access_token;
    if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
      accessToken = await refreshAccessToken(account.refresh_token, supabaseAdmin, account.id);
    }

    const body = await req.json().catch(() => ({}));
    const maxResults = body.max_results || 50;

    // Fetch emails from Gmail API
    const emails = await fetchGmailMessages(accessToken, account, userId, supabaseAdmin, maxResults);

    // If we got 401 on first try, refresh and retry
    if (emails === null && account.refresh_token) {
      accessToken = await refreshAccessToken(account.refresh_token, supabaseAdmin, account.id);
      const retryEmails = await fetchGmailMessages(accessToken, account, userId, supabaseAdmin, maxResults);
      if (retryEmails === null) {
        return new Response(JSON.stringify({ error: "Gmail API error after token refresh" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // AI prioritize
      await aiPrioritize(retryEmails, supabaseAdmin);

      await supabaseAdmin
        .from("email_accounts")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", account.id);

      return new Response(JSON.stringify({ synced: retryEmails.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (emails === null) {
      return new Response(JSON.stringify({ error: "Gmail API error" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // AI prioritize emails using Lovable AI
    await aiPrioritize(emails, supabaseAdmin);

    // Update last_synced_at
    await supabaseAdmin
      .from("email_accounts")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", account.id);

    return new Response(JSON.stringify({ synced: emails.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("gmail-sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function refreshAccessToken(refreshToken: string, supabaseAdmin: any, accountId: string): Promise<string> {
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error}`);
  }

  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("email_accounts")
    .update({ access_token: data.access_token, token_expires_at: expiresAt })
    .eq("id", accountId);

  return data.access_token;
}

async function fetchGmailMessages(accessToken: string, account: any, userId: string, supabaseAdmin: any, maxResults: number): Promise<any[] | null> {
  // Fetch all message IDs with pagination (Gmail API max 100 per page)
  let allMessageIds: any[] = [];
  let pageToken: string | null = null;

  do {
    let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const listRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!listRes.ok) {
      console.error("Gmail list error:", listRes.status, await listRes.text());
      return null;
    }

    const listData = await listRes.json();
    allMessageIds.push(...(listData.messages || []));
    pageToken = listData.nextPageToken || null;

    if (allMessageIds.length >= maxResults) {
      allMessageIds = allMessageIds.slice(0, maxResults);
      break;
    }
  } while (pageToken);

  console.log(`Fetching details for ${allMessageIds.length} messages...`);
  const emails: any[] = [];

  // Fetch details in parallel batches of 10
  for (let i = 0; i < allMessageIds.length; i += 10) {
    const batch = allMessageIds.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map((msg: any) =>
        fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ).then(r => r.ok ? r.json() : null)
      )
    );

    for (const result of results) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const detail = result.value;

      try {
        const headers = detail.payload?.headers || [];
        const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

        const fromRaw = getHeader("From");
        const fromMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/);
        const fromName = fromMatch ? fromMatch[1].replace(/"/g, "").trim() : fromRaw;
        const fromAddress = fromMatch ? fromMatch[2] : fromRaw;

        const toRaw = getHeader("To");
        const toAddresses = toRaw ? toRaw.split(",").map((t: string) => t.trim()).filter(Boolean) : [];
        const ccRaw = getHeader("Cc");
        const ccAddresses = ccRaw ? ccRaw.split(",").map((t: string) => t.trim()).filter(Boolean) : [];

        const labels = detail.labelIds || [];
        const isRead = !labels.includes("UNREAD");
        const isStarred = labels.includes("STARRED");
        const isImportant = labels.includes("IMPORTANT");

        let bodyText = "";
        let bodyHtml = "";
        const extractBody = (part: any) => {
          if (part.mimeType === "text/plain" && part.body?.data) {
            bodyText = atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
          }
          if (part.mimeType === "text/html" && part.body?.data) {
            bodyHtml = atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
          }
          if (part.parts) part.parts.forEach(extractBody);
        };
        extractBody(detail.payload);

        const hasAttachments = (detail.payload?.parts || []).some((p: any) => p.filename && p.filename.length > 0);

        const dateStr = getHeader("Date");
        let receivedAt: string;
        try {
          receivedAt = new Date(dateStr).toISOString();
        } catch {
          receivedAt = new Date(parseInt(detail.internalDate)).toISOString();
        }

        emails.push({
          email_account_id: account.id,
          company_id: account.company_id,
          user_id: userId,
          gmail_id: detail.id,
          thread_id: detail.threadId,
          from_address: fromAddress,
          from_name: fromName,
          to_addresses: toAddresses,
          cc_addresses: ccAddresses,
          subject: getHeader("Subject") || "(Intet emne)",
          snippet: detail.snippet || "",
          body_text: bodyText.substring(0, 10000),
          body_html: bodyHtml.substring(0, 50000),
          labels,
          is_read: isRead,
          is_starred: isStarred,
          is_important: isImportant,
          has_attachments: hasAttachments,
          received_at: receivedAt,
        });
      } catch (e) {
        console.error(`Error parsing message:`, e);
      }
    }
  }

  // Upsert emails in chunks
  if (emails.length > 0) {
    for (let i = 0; i < emails.length; i += 50) {
      const chunk = emails.slice(i, i + 50);
      const { error } = await supabaseAdmin
        .from("emails")
        .upsert(chunk, { onConflict: "email_account_id,gmail_id" });
      if (error) console.error("Email upsert error:", error);
    }
    console.log(`Upserted ${emails.length} emails`);
  }

  return emails;
}

async function aiPrioritize(emails: any[], supabaseAdmin: any) {
  if (!emails.length) return;

  const LOVABLE_API_KEY = (Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
  if (!LOVABLE_API_KEY) {
    console.log("No LOVABLE_API_KEY, skipping AI prioritization");
    return;
  }

  // Only prioritize unread emails without existing priority
  const toPrioritize = emails.filter(e => !e.is_read && !e.ai_priority);
  if (!toPrioritize.length) return;

  // Batch emails for AI analysis (max 20 at a time)
  const batch = toPrioritize.slice(0, 20);
  const emailSummaries = batch.map((e, i) =>
    `[${i}] Fra: ${e.from_name} <${e.from_address}>\nEmne: ${e.subject}\nUddrag: ${(e.snippet || "").substring(0, 200)}`
  ).join("\n---\n");

  try {
    const aiRes = await fetch((Deno.env.get("AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Du er en email-prioriterings-AI for et dansk CRM-system. Analyser emails og klassificer dem.

For hver email, returner en JSON med:
- index: email-nummeret
- priority: en af "meeting", "deadline", "invoice", "contract", eller null (hvis ingen særlig prioritet)
- todo: en kort handlingsforeslåelse på dansk (eller null)

Regler:
- "meeting": mødeindkaldelser, agenda, kalenderinvitationer
- "deadline": hastende opgaver, deadlines, tidsfrister
- "invoice": fakturaer, betalinger, regninger
- "contract": kontrakter, aftaler, underskrifter
- null: nyhedsbreve, reklamer, automatiske beskeder, generelle emails

Returner KUN valid JSON array. Ingen forklaring.`
          },
          {
            role: "user",
            content: `Analyser disse emails:\n\n${emailSummaries}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_emails",
              description: "Classify emails by priority",
              parameters: {
                type: "object",
                properties: {
                  classifications: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "number" },
                        priority: { type: "string", enum: ["meeting", "deadline", "invoice", "contract", "none"] },
                        todo: { type: "string" }
                      },
                      required: ["index", "priority"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["classifications"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "classify_emails" } },
      }),
    });

    if (!aiRes.ok) {
      const status = aiRes.status;
      console.error("AI prioritization error:", status);
      if (status === 429) console.error("Rate limited - skipping AI prioritization");
      if (status === 402) console.error("Payment required - skipping AI prioritization");
      return;
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response");
      return;
    }

    const { classifications } = JSON.parse(toolCall.function.arguments);
    if (!Array.isArray(classifications)) return;

    // Update each email with AI priority
    for (const cls of classifications) {
      if (cls.index < 0 || cls.index >= batch.length) continue;
      const email = batch[cls.index];
      const priority = cls.priority === "none" ? null : cls.priority;
      const todo = cls.todo || null;

      if (priority || todo) {
        await supabaseAdmin
          .from("emails")
          .update({ ai_priority: priority, ai_suggested_todo: todo })
          .eq("gmail_id", email.gmail_id)
          .eq("user_id", email.user_id);
      }
    }

    console.log(`AI prioritized ${classifications.filter((c: any) => c.priority !== "none").length} emails`);
  } catch (e) {
    console.error("AI prioritization failed:", e);
    // Don't throw - prioritization is optional
  }
}
