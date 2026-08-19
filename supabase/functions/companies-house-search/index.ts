import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const url = new URL(req.url);
    const query = url.searchParams.get("q");
    if (!query) {
      return new Response(JSON.stringify({ error: "Missing query parameter 'q'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("COMPANIES_HOUSE_API_KEY");
    if (!apiKey) throw new Error("COMPANIES_HOUSE_API_KEY not configured");

    const credentials = btoa(`${apiKey}:`);
    const chUrl = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(query)}&items_per_page=20`;

    const response = await fetch(chUrl, {
      headers: { Authorization: `Basic ${credentials}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Companies House API error [${response.status}]: ${text}`);
    }

    const data = await response.json();

    interface CompaniesHouseResult {
      company_number: string;
      title: string;
      address_snippet?: string;
      company_type?: string;
      company_status?: string;
    }
    const items = ((data.items || []) as CompaniesHouseResult[]).map((c) => ({
      company_number: c.company_number,
      title: c.title,
      address_snippet: c.address_snippet || "",
      company_type: c.company_type || "",
      company_status: c.company_status || "",
    }));

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("companies-house-search error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
