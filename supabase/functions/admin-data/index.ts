import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, action, companyId, disabled } = await req.json();

    // Verify admin code on every request
    const adminCode = Deno.env.get("ADMIN_ACCESS_CODE");
    if (!adminCode || !code || code.trim() !== adminCode.trim()) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

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
      supabase.from("companies").select("id, name, phone, email, status, subscription_status, stripe_customer_id, stripe_subscription_id, trial_ends_at, industry, created_at, disabled").order("created_at", { ascending: false }),
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
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
