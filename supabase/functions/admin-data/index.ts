import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cross-tenant admin endpoint — every request must belong to an authenticated
// user who actually holds the `system_admin` role (public.has_role, the same
// function every RLS policy in this project already trusts). There is no
// shared-secret path anymore: a stolen/guessed string used to be enough to
// read every company's data and disable any tenant. verify_jwt=true on this
// function (supabase/config.toml) rejects unauthenticated calls before they
// even reach this code; the role check below is the authorization layer.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, "")
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isSystemAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "system_admin",
    });
    if (roleErr || !isSystemAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, companyId, disabled } = await req.json().catch(() => ({}));

    // Toggle company disabled status
    if (action === "toggle_company") {
      if (!companyId || typeof disabled !== "boolean") {
        return new Response(JSON.stringify({ error: "Missing companyId or disabled" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase
        .from("companies")
        .update({ disabled })
        .eq("id", companyId);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default action: fetch all data
    const [companiesRes, profilesRes, employeesRes, rolesRes] = await Promise.all([
      supabase.from("companies").select("id, name, phone, email, status, subscription_status, stripe_customer_id, stripe_subscription_id, trial_ends_at, industry, created_at, disabled, purchased_seats").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, company_id, full_name, email"),
      supabase.from("employee_profiles").select("id, company_id, full_name, email, phone, position, department"),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    if (companiesRes.error) throw companiesRes.error;

    return new Response(JSON.stringify({
      companies: companiesRes.data || [],
      profiles: profilesRes.data || [],
      employees: employeesRes.data || [],
      roles: rolesRes.data || [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
