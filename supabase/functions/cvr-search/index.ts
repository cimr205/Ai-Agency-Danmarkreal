import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const USER_AGENT =
  "AI Agency Danmark - CVR Lookup - Cimraan - kontakt@aiagency.dk";

// Simple in-memory cache (per cold-start)
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// Rate limit: max 30 requests per minute per company
const rateLimits = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(companyId: string): boolean {
  const now = Date.now();
  const hits = (rateLimits.get(companyId) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW
  );
  if (hits.length >= RATE_LIMIT_MAX) return false;
  hits.push(now);
  rateLimits.set(companyId, hits);
  return true;
}

interface CvrCompany {
  name?: string;
  vat?: number;
  address?: string;
  zipcode?: number;
  city?: string;
  phone?: string;
  email?: string;
  industrydesc?: string;
  industrycode?: number;
  employees?: string;
  companyform?: string;
  status?: string;
  url?: string; // website field from CVRAPI
  startdate?: string;
  enddate?: string;
  owners?: unknown[];
}

function cleanCompany(raw: CvrCompany) {
  return {
    name: raw.name ?? null,
    cvr: raw.vat ? String(raw.vat) : null,
    address: raw.address ?? null,
    zipcode: raw.zipcode ? String(raw.zipcode) : null,
    city: raw.city ?? null,
    phone: raw.phone ?? null,
    email: raw.email ?? null,
    industry: raw.industrydesc ?? null,
    industrycode: raw.industrycode ? String(raw.industrycode) : null,
    employees: raw.employees ?? null,
    companyform: raw.companyform ?? null,
    status: raw.status ?? null,
    website: raw.url ?? null,
    startdate: raw.startdate ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Ikke autoriseret" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Ikke autoriseret" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();

    if (!profile?.company_id) {
      return new Response(
        JSON.stringify({ error: "Ingen virksomhed tilknyttet" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit check
    if (!checkRateLimit(profile.company_id)) {
      return new Response(
        JSON.stringify({
          error: "For mange forespørgsler. Vent venligst et minut.",
          code: "RATE_LIMITED",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse & validate input
    let body: { search?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Ugyldig request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const searchTerm = (body.search ?? "").trim();

    if (!searchTerm || searchTerm.length < 2) {
      return new Response(
        JSON.stringify({
          error: "Søgning skal indeholde mindst 2 tegn",
          code: "INVALID_INPUT",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (searchTerm.length > 200) {
      return new Response(
        JSON.stringify({
          error: "Søgningen er for lang (max 200 tegn)",
          code: "INVALID_INPUT",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check cache
    const cacheKey = searchTerm.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call CVRAPI
    const url = new URL("https://cvrapi.dk/api");
    url.searchParams.set("search", searchTerm);
    url.searchParams.set("country", "dk");
    url.searchParams.set("format", "json");
    url.searchParams.set("version", "6");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let apiRes: Response;
    try {
      apiRes = await fetch(url.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      const isTimeout =
        err instanceof DOMException && err.name === "AbortError";
      return new Response(
        JSON.stringify({
          error: isTimeout
            ? "CVR API svarer ikke. Prøv igen om lidt."
            : "Kunne ikke kontakte CVR API",
          code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } finally {
      clearTimeout(timeout);
    }

    // Handle CVRAPI error responses
    if (!apiRes.ok) {
      const status = apiRes.status;
      let errorMsg = "CVR opslag fejlede";
      let code = "API_ERROR";

      if (status === 404) {
        // No results - return empty array, not error
        const result = { results: [], total: 0, query: searchTerm };
        cache.set(cacheKey, { data: result, ts: Date.now() });
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else if (status === 403) {
        errorMsg = "Ugyldig User-Agent. Kontakt support.";
        code = "INVALID_UA";
      } else if (status === 429) {
        errorMsg = "CVRAPI kvoter opbrugt. Prøv igen senere.";
        code = "QUOTA_EXCEEDED";
      } else if (status >= 500) {
        errorMsg = "CVRAPI er midlertidigt utilgængelig. Prøv igen om lidt.";
        code = "CVRAPI_DOWN";
      }

      return new Response(
        JSON.stringify({ error: errorMsg, code }),
        {
          status: status === 429 ? 429 : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const rawData = await apiRes.json();

    // CVRAPI returns a single object for exact CVR lookup, or array for search
    let companies: CvrCompany[];
    if (Array.isArray(rawData)) {
      companies = rawData;
    } else if (rawData && typeof rawData === "object" && rawData.name) {
      // Single result
      companies = [rawData];
    } else {
      companies = [];
    }

    const cleaned = companies.map(cleanCompany);

    const result = {
      results: cleaned,
      total: cleaned.length,
      query: searchTerm,
    };

    cache.set(cacheKey, { data: result, ts: Date.now() });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("CVR search error:", err instanceof Error ? err.message : "Unknown error");
    return new Response(
      JSON.stringify({
        error: "Intern fejl. Prøv igen.",
        code: "INTERNAL_ERROR",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
