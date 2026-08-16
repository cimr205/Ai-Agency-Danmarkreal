import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), c => c.charCodeAt(0));

Deno.serve(async (req) => {
  // Handle tracking pixel requests (GET with recipient_id param)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const recipientId = url.searchParams.get("rid");

    if (recipientId) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        );

        // Update recipient open status
        const { data: recipient } = await supabase
          .from("bulk_email_recipients")
          .select("id, campaign_id, opened_at, open_count")
          .eq("id", recipientId)
          .single();

        if (recipient) {
          // Update recipient
          await supabase
            .from("bulk_email_recipients")
            .update({
              opened_at: recipient.opened_at || new Date().toISOString(),
              open_count: (recipient.open_count || 0) + 1,
            })
            .eq("id", recipientId);

          // Update campaign open count if first open
          if (!recipient.opened_at) {
            await supabase.rpc("increment_campaign_opens", {
              p_campaign_id: recipient.campaign_id,
            });
          }
        }
      } catch (e) {
        console.error("Tracking error:", e);
      }
    }

    // Always return the pixel regardless of tracking success
    return new Response(PIXEL, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  }

  // Handle unsubscribe (GET with unsub param)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const unsubId = url.searchParams.get("unsub");
    if (unsubId) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const { data: recipient } = await supabase
          .from("bulk_email_recipients")
          .select("id, campaign_id, unsubscribed_at")
          .eq("id", unsubId)
          .single();

        if (recipient && !recipient.unsubscribed_at) {
          await supabase
            .from("bulk_email_recipients")
            .update({ unsubscribed_at: new Date().toISOString() })
            .eq("id", unsubId);

          // Increment campaign unsubscribe count
          await supabase.rpc("increment_campaign_unsubs", {
            p_campaign_id: recipient.campaign_id,
          });
        }

        return new Response(
          `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Afmeldt</title></head>
          <body style="font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;">
          <div style="text-align:center;padding:40px;">
            <h1 style="font-size:24px;color:#111;">Du er nu afmeldt</h1>
            <p style="color:#666;margin-top:12px;">Du vil ikke modtage flere emails fra denne afsender.</p>
          </div></body></html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      } catch (e) {
        console.error("Unsubscribe error:", e);
      }
    }
  }

  return new Response("OK", { status: 200 });
});
