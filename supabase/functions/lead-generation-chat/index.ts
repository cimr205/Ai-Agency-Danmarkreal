import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Category Synonym Map (DK + generic) ────────────────────
const CATEGORY_MAP: Record<string, string[]> = {
  "håndværker": ["tømrer", "murer", "elektriker", "VVS", "maler", "gulvlægger", "entreprenør", "snedker"],
  "it": ["software", "IT", "webudvikling", "systemudvikling", "hosting", "tech"],
  "marketing bureau": ["marketing bureau", "reklamebureau", "digital marketing", "SEO bureau", "reklame", "medieprodukter", "advertising agency", "marketing"],
  "reklamebureau": ["reklamebureau", "marketing bureau", "digital marketing", "reklame", "advertising agency", "medieprodukter"],
  "digital marketing": ["digital marketing", "marketing bureau", "SEO bureau", "online marketing", "social media bureau", "digital bureau"],
  "bureau": ["bureau", "marketing bureau", "reklamebureau", "digital bureau", "kommunikationsbureau", "PR bureau", "medibureau"],
  "kommunikation": ["kommunikationsbureau", "PR bureau", "reklamebureau", "marketing bureau"],
  "pr": ["PR bureau", "kommunikationsbureau", "pressehåndtering"],
  "medie": ["mediebureau", "medieprodukter", "reklamebureau", "produktion"],
  "webbureau": ["webbureau", "webudvikling", "digital bureau", "webdesign"],
  "seo": ["SEO bureau", "digital marketing", "marketing bureau", "online marketing"],
  "advokat": ["advokatfirma", "advokat", "juridisk rådgivning", "law firm"],
  "revisor": ["revision", "revisor", "bogføring", "regnskab", "accounting"],
  "restaurant": ["restaurant", "café", "catering", "pizzeria", "takeaway", "bar", "bistro"],
  "ejendomsmægler": ["ejendomsmægler", "ejendom", "bolighandel", "real estate"],
  "transport": ["transport", "logistik", "fragt", "vognmand"],
  "rengøring": ["rengøring", "facility service", "vinduespolering", "cleaning"],
  "tandlæge": ["tandlæge", "tandklinik", "dentist"],
  "læge": ["læge", "lægeklinik", "sundhed", "doctor"],
  "frisør": ["frisør", "salon", "barbershop", "hairdresser"],
  "tømrer": ["tømrer", "snedker", "træarbejde", "carpenter"],
  "elektriker": ["elektriker", "el-installation", "electrician"],
  "vvs": ["VVS", "blikkenslager", "varmepumpe", "plumber"],
  "maler": ["maler", "malerservice", "painter"],
  "murer": ["murer", "murerfirma", "mason"],
  "anlægsgartner": ["anlægsgartner", "haveservice", "gartner", "landscaper"],
  "arkitekt": ["arkitekt", "arkitektfirma", "architect"],
  "konsulent": ["konsulent", "rådgivning", "consulting"],
  "butik": ["butik", "detailhandel", "retail", "shop"],
  "mekaniker": ["autoværksted", "mekaniker", "bilværksted", "mechanic"],
  "flyttefirma": ["flyttefirma", "flytning", "moving"],
  "fotograf": ["fotograf", "fotografering", "photography"],
  "fitness": ["fitness", "gym", "træningscenter", "crossfit", "yoga"],
  "hotel": ["hotel", "bed and breakfast", "hostel", "accommodation"],
  "byggeri": ["byggeri", "construction", "entreprenør"],
  "marketing": ["marketing", "marketing bureau", "reklamebureau", "digital marketing", "SEO", "medibureau", "reklame", "advertising"],
  "bilværksted": ["bilværksted", "autoværksted", "mekaniker", "car repair"],
};

// ─── Krak category mapping ──────────────────────────────────
const KRAK_CATEGORY_MAP: Record<string, string> = {
  "tømrer": "tømrer",
  "murer": "murer",
  "elektriker": "elektriker",
  "vvs": "vvs",
  "maler": "maler",
  "frisør": "frisør",
  "revisor": "revisor",
  "advokat": "advokat",
  "restaurant": "restaurant",
  "tandlæge": "tandlæge",
  "læge": "læge",
  "ejendomsmægler": "ejendomsmægler",
  "rengøring": "rengøring",
  "transport": "transport",
  "mekaniker": "autoværksted",
  "bilværksted": "autoværksted",
  "arkitekt": "arkitekt",
  "anlægsgartner": "anlægsgartner",
  "fotograf": "fotograf",
  "flyttefirma": "flyttefirma",
  "konsulent": "konsulent",
  "marketing bureau": "marketing",
  "reklamebureau": "reklamebureau",
  "digital marketing": "marketing",
  "hotel": "hotel",
  "fitness": "fitness",
  "byggeri": "byggeri",
  "håndværker": "håndværker",
  "it": "it",
  "webbureau": "webbureau",
  "marketing": "marketing",
};

const GENERIC_TERMS = new Set([
  "virksomheder", "virksomhed", "firmaer", "firma", "selskaber", "selskab",
  "companies", "businesses", "forretninger", "forretning", "erhverv",
]);

function isGenericSearch(category: string): boolean {
  return GENERIC_TERMS.has(category.toLowerCase().trim());
}

function expandCategory(category: string): string[] {
  if (isGenericSearch(category)) return [];
  const lower = category.toLowerCase().trim();
  if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower];
  const words = lower.replace(/[^a-zæøåäöü0-9\s]/g, "").split(/\s+/);
  for (const [key, values] of Object.entries(CATEGORY_MAP)) {
    const keyWords = key.split(/\s+/);
    if (words.some(w => keyWords.some(kw => w.startsWith(kw) || kw.startsWith(w) || w.includes(kw) || kw.includes(w)))) {
      return values;
    }
  }
  return [category];
}

function getKrakCategory(category: string): string {
  const lower = category.toLowerCase().trim();
  if (KRAK_CATEGORY_MAP[lower]) return KRAK_CATEGORY_MAP[lower];
  const words = lower.replace(/[^a-zæøåäöü0-9\s]/g, "").split(/\s+/);
  for (const [key, value] of Object.entries(KRAK_CATEGORY_MAP)) {
    const keyWords = key.split(/\s+/);
    if (words.some(w => keyWords.some(kw => w.startsWith(kw) || kw.startsWith(w) || w.includes(kw) || kw.includes(w)))) {
      return value;
    }
  }
  return category;
}

// ─── Fetch helper ───────────────────────────────────────────
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════
// SOURCE 1: GOOGLE MAPS (Apify)
// ═══════════════════════════════════════════════════════════
async function searchGoogleMaps(
  queries: string[],
  location: string,
  maxResults = 50,
  onProgress?: (msg: string, count: number) => void,
): Promise<any[]> {
  const token = Deno.env.get("APIFY_API_TOKEN");
  if (!token) { console.error("APIFY_API_TOKEN not configured"); return []; }

  const searchQueries = queries.map(q => location ? `${q} i ${location}` : q);
  onProgress?.("🔍 Søger i Google Maps...", 0);

  // Allow up to 200 per search query to support larger requests and enforce minimums
  const perQuery = Math.min(Math.ceil((maxResults * 1.5) / searchQueries.length), 200);

  try {
    const runRes = await fetchWithTimeout(
      `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchStringsArray: searchQueries,
          maxCrawledPlacesPerSearch: perQuery,
          language: "da",
          deeperCityScrape: false,
          skipClosedPlaces: true,
        }),
      },
      120000,
    );

    if (!runRes.ok) {
      console.error("Google Maps sync failed:", runRes.status);
      return await searchGoogleMapsAsync(token, searchQueries, maxResults, onProgress);
    }

    const items = await runRes.json();
    if (!Array.isArray(items)) return [];
    onProgress?.(`✅ Google Maps: ${items.length} virksomheder`, items.length);
    return items.map(mapGoogleItem).filter(Boolean);
  } catch (e) {
    console.error("Google Maps error:", e);
    return await searchGoogleMapsAsync(token, searchQueries, maxResults, onProgress);
  }
}

async function searchGoogleMapsAsync(
  token: string, searchQueries: string[], maxResults: number,
  onProgress?: (msg: string, count: number) => void,
): Promise<any[]> {
  const perQuery = Math.min(Math.ceil(maxResults / searchQueries.length), 100);
  try {
    const startRes = await fetchWithTimeout(
      `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchStringsArray: searchQueries,
          maxCrawledPlacesPerSearch: perQuery,
          language: "da", deeperCityScrape: false, skipClosedPlaces: true,
        }),
      },
      15000,
    );
    if (!startRes.ok) return [];
    const runData = await startRes.json();
    const runId = runData?.data?.id;
    if (!runId) return [];

    onProgress?.("⏳ Google Maps — venter på resultater...", 0);
    const startTime = Date.now();
    let datasetId: string | null = null;
    while (Date.now() - startTime < 120000) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const statusRes = await fetchWithTimeout(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`, {}, 8000);
        if (!statusRes.ok) continue;
        const status = await statusRes.json();
        if (status?.data?.status === "SUCCEEDED") { datasetId = status?.data?.defaultDatasetId; break; }
        if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status?.data?.status)) return [];
        onProgress?.(`⏳ Google Maps... (${Math.round((Date.now() - startTime) / 1000)}s)`, 0);
      } catch { /* continue */ }
    }
    if (!datasetId) return [];
    const dataRes = await fetchWithTimeout(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=${maxResults}`, {}, 15000);
    if (!dataRes.ok) return [];
    const items = await dataRes.json();
    if (!Array.isArray(items)) return [];
    onProgress?.(`✅ Google Maps: ${items.length} virksomheder`, items.length);
    return items.map(mapGoogleItem).filter(Boolean);
  } catch { return []; }
}

function mapGoogleItem(item: any): any | null {
  if (!item?.title) return null;
  const phone = (item.phone || item.phoneUnformatted || "").replace(/\s/g, "");
  return {
    name: item.title,
    number: "",
    address: item.address || item.street || "",
    city: item.city || item.neighborhood || "",
    type: item.categoryName || item.categories?.[0] || "",
    industry: item.categoryName || item.categories?.join(", ") || "",
    status: item.permanentlyClosed ? "Permanent lukket" : item.temporarilyClosed ? "Midlertidigt lukket" : "Aktiv",
    country: "DK",
    email: item.email || "",
    phone,
    website: item.website || item.url || "",
    source: "Google",
    sources: ["Google"],
    source_details: { phone_source: phone ? "Google" : "", email_source: item.email ? "Google" : "", address_source: "Google" },
    rating: item.totalScore || null,
    reviews: item.reviewsCount || 0,
    place_id: item.placeId || "",
    phone_confidence: phone ? "high" : "none",
    email_confidence: item.email ? "medium" : "none",
    data_quality: phone && item.email ? "high" : phone || item.email ? "medium" : "low",
  };
}

// ═══════════════════════════════════════════════════════════
// SOURCE 2: KRAK (Apify Actor: ecomscrape/krak-business-search-scraper)
// ═══════════════════════════════════════════════════════════
async function searchKrak(
  category: string,
  location: string,
  maxResults = 50,
  onProgress?: (msg: string, count: number) => void,
): Promise<any[]> {
  const token = Deno.env.get("APIFY_API_TOKEN");
  if (!token) { console.error("APIFY_API_TOKEN not configured for Krak"); return []; }

  onProgress?.("🔍 Søger på Krak.dk...", 0);

  const krakCategory = getKrakCategory(category);
  // Build keyword: combine category + location for Krak search
  const keyword = location ? `${krakCategory} ${location}` : krakCategory;

  try {
    // Try sync first — allow up to 200 items
    const krakMaxItems = Math.min(maxResults, 200);
    const runRes = await fetchWithTimeout(
      `https://api.apify.com/v2/acts/ecomscrape~krak-business-search-scraper/run-sync-get-dataset-items?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          max_items_per_url: krakMaxItems,
          max_retries_per_url: 2,
          proxy: {
            useApifyProxy: true,
            apifyProxyGroups: ["RESIDENTIAL"],
            apifyProxyCountry: "DK",
          },
        }),
      },
      120000,
    );

    if (!runRes.ok) {
      console.error("Krak Apify sync failed:", runRes.status);
      return await searchKrakAsync(token, keyword, maxResults, onProgress);
    }

    const items = await runRes.json();
    if (!Array.isArray(items)) return [];
    onProgress?.(`✅ Krak: ${items.length} virksomheder`, items.length);
    return items.map(mapKrakApifyItem).filter(Boolean).slice(0, maxResults);
  } catch (e) {
    console.error("Krak Apify error:", e);
    return await searchKrakAsync(token, keyword, maxResults, onProgress);
  }
}

async function searchKrakAsync(
  token: string, keyword: string, maxResults: number,
  onProgress?: (msg: string, count: number) => void,
): Promise<any[]> {
  const krakMaxItems = Math.min(maxResults, 200);
  try {
    const startRes = await fetchWithTimeout(
      `https://api.apify.com/v2/acts/ecomscrape~krak-business-search-scraper/runs?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          max_items_per_url: krakMaxItems,
          max_retries_per_url: 2,
          proxy: {
            useApifyProxy: true,
            apifyProxyGroups: ["RESIDENTIAL"],
            apifyProxyCountry: "DK",
          },
        }),
      },
      15000,
    );
    if (!startRes.ok) return [];
    const runData = await startRes.json();
    const runId = runData?.data?.id;
    if (!runId) return [];

    onProgress?.("⏳ Krak — venter på resultater...", 0);
    const startTime = Date.now();
    let datasetId: string | null = null;
    while (Date.now() - startTime < 120000) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const statusRes = await fetchWithTimeout(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`, {}, 8000);
        if (!statusRes.ok) continue;
        const status = await statusRes.json();
        if (status?.data?.status === "SUCCEEDED") { datasetId = status?.data?.defaultDatasetId; break; }
        if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status?.data?.status)) return [];
        onProgress?.(`⏳ Krak... (${Math.round((Date.now() - startTime) / 1000)}s)`, 0);
      } catch { /* continue */ }
    }
    if (!datasetId) return [];
    const dataRes = await fetchWithTimeout(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=${maxResults}`, {}, 15000);
    if (!dataRes.ok) return [];
    const items = await dataRes.json();
    if (!Array.isArray(items)) return [];
    onProgress?.(`✅ Krak: ${items.length} virksomheder`, items.length);
    return items.map(mapKrakApifyItem).filter(Boolean).slice(0, maxResults);
  } catch { return []; }
}

function mapKrakApifyItem(item: any): any | null {
  if (!item?.name) return null;

  // Extract phone from phones array
  const phone = item.phones?.[0]?.number?.replace(/[\s-]/g, "") || "";

  // Extract address from addresses array
  const addr = item.addresses?.[0];
  const street = addr ? [addr.street_name, addr.street_number].filter(Boolean).join(" ") : "";
  const address = addr ? [street, addr.postal_code, addr.postal_area].filter(Boolean).join(", ") : "";
  const city = addr?.postal_area || addr?.municipality || "";

  // Extract email from products array
  const emailProduct = item.products?.find((p: any) => p.name === "email");
  const email = emailProduct?.link || "";

  // Extract website from products array
  const websiteProduct = item.products?.find((p: any) => p.name === "homepage");
  const website = websiteProduct?.link || websiteProduct?.url || "";

  // CVR / organisation number
  const cvr = item.organisation_number || "";

  // Categories
  const categories = item.categories?.map((c: any) => c.name).filter(Boolean) || [];

  return {
    name: item.name,
    number: cvr,
    address,
    city,
    type: categories[0] || "",
    industry: categories.join(", ") || "",
    status: "Aktiv",
    country: "DK",
    email,
    phone,
    website,
    source: "Krak",
    sources: ["Krak"],
    source_details: {
      phone_source: phone ? "Krak" : "",
      email_source: email ? "Krak" : "",
      address_source: address ? "Krak" : "",
    },
    rating: null,
    reviews: 0,
    place_id: item.eniro_id || "",
    phone_confidence: phone ? "high" : "none",
    email_confidence: email ? "high" : "none",
    data_quality: phone && email ? "high" : phone || email ? "medium" : "low",
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

// ═══════════════════════════════════════════════════════════
// SOURCE 3: WEBSITE SCRAPING (Enrichment)
// ═══════════════════════════════════════════════════════════
async function scrapeContactFromWebsite(url: string): Promise<{
  email?: string; phone?: string; social_links: string[];
  phone_confidence: string; email_confidence: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadGenBot/1.0)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return { social_links: [], phone_confidence: "none", email_confidence: "none" };

    const html = await res.text();

    const emailMatches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    const emails = emailMatches?.filter(
      e => !e.includes("example") && !e.includes("wixpress") && !e.includes("sentry") &&
           !e.includes("@2x") && !e.includes("@media") && !e.endsWith(".png") && !e.endsWith(".jpg")
    ) || [];

    const phoneMatches = html.match(/(?:\+45|(?:\+47)|(?:\+44)|(?:\+46)|(?:\+49))[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,4}/g);
    const dkPhoneMatches = html.match(/\b\d{2}\s?\d{2}\s?\d{2}\s?\d{2}\b/g);
    const socialMatches = html.match(/https?:\/\/(www\.)?(linkedin|facebook|instagram|twitter)\.com\/[^\s"'<>]+/g) || [];
    const foundPhone = phoneMatches?.[0] || (dkPhoneMatches?.[0] ? `+45 ${dkPhoneMatches[0]}` : undefined);

    return {
      email: emails[0] || undefined,
      phone: foundPhone || undefined,
      social_links: [...new Set(socialMatches)].slice(0, 5),
      phone_confidence: foundPhone ? "medium" : "none",
      email_confidence: emails[0] ? "medium" : "none",
    };
  } catch {
    return { social_links: [], phone_confidence: "none", email_confidence: "none" };
  }
}

// ═══════════════════════════════════════════════════════════
// ENRICHMENT PIPELINE
// ═══════════════════════════════════════════════════════════
async function enrichLeadContacts(
  leads: any[],
  onProgress?: (msg: string) => void,
): Promise<any[]> {
  const withWebsite = leads.filter(l => l.website && (!l.phone || !l.email));
  const scrapeLimit = leads.length >= 100 ? 30 : 15;
  const batch = withWebsite.slice(0, scrapeLimit);

  if (batch.length === 0) return leads;
  onProgress?.(`🌐 Scraper ${batch.length} hjemmesider for kontaktdata...`);

  const results = await Promise.allSettled(
    batch.map(async lead => {
      const url = lead.website.startsWith("http") ? lead.website : `https://${lead.website}`;
      const scraped = await scrapeContactFromWebsite(url);
      return { leadName: lead.name, ...scraped };
    }),
  );

  const websiteMap = new Map<string, any>();
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) websiteMap.set(r.value.leadName, r.value);
  }

  return leads.map(lead => {
    const ws = websiteMap.get(lead.name);
    if (!ws) return lead;
    const newSources = [...(lead.sources || [])];
    const sd = { ...(lead.source_details || {}) };
    if (ws.phone && !lead.phone) { sd.phone_source = "Website"; if (!newSources.includes("Website")) newSources.push("Website"); }
    if (ws.email && !lead.email) { sd.email_source = "Website"; if (!newSources.includes("Website")) newSources.push("Website"); }
    return {
      ...lead,
      phone: lead.phone || ws.phone,
      email: lead.email || ws.email,
      phone_confidence: lead.phone ? lead.phone_confidence : ws.phone_confidence,
      email_confidence: lead.email ? lead.email_confidence : ws.email_confidence,
      source: newSources.join(" + "),
      sources: newSources,
      source_details: sd,
    };
  });
}

// ─── CVR Enrichment ─────────────────────────────────────────
async function enrichWithCVR(leads: any[], onProgress?: (msg: string) => void): Promise<any[]> {
  const toEnrich = leads.filter(l => !l.number && l.country === "DK" && l.name);
  if (toEnrich.length === 0) return leads;

  onProgress?.(`🏢 CVR-opslag for ${toEnrich.length} virksomheder...`);

  // Process in batches of 8 with 200ms delay between batches to respect rate limits
  const BATCH_SIZE = 8;
  const allEnrichResults: (any | null)[] = [];

  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    const batch = toEnrich.slice(i, i + BATCH_SIZE);
    if (i > 0) await new Promise(r => setTimeout(r, 200));

    const batchResults = await Promise.all(batch.map(async lead => {
      try {
        const res = await fetchWithTimeout(
          `https://cvrapi.dk/api?search=${encodeURIComponent(lead.name)}&country=dk&format=json&version=6`,
          { headers: { "User-Agent": "AI Agency Danmark - CVR Lookup - kontakt@aiagency.dk" } },
          4000,
        );
        if (!res.ok) return null;
        const data = await res.json();
        const match = Array.isArray(data) ? data[0] : data;
        if (!match?.vat) return null;
        const matchName = normalize(match.name || "");
        const leadName = normalize(lead.name);
        if (matchName && leadName && (matchName.includes(leadName) || leadName.includes(matchName) || matchName === leadName)) {
          return {
            leadName: lead.name,
            cvr: String(match.vat),
            email: match.email || "",
            phone: match.phone ? String(match.phone) : "",
            industry: match.industrydesc || "",
            address: [match.address, match.zipcode, match.city].filter(Boolean).join(", "),
            city: match.city || "",
            website: match.url || "",
          };
        }
        return null;
      } catch { return null; }
    }));

    allEnrichResults.push(...batchResults);
    const matched = allEnrichResults.filter(Boolean).length;
    onProgress?.(`🏢 CVR: ${matched}/${Math.min(i + BATCH_SIZE, toEnrich.length)} matchet...`);
  }

  const enrichResults = allEnrichResults;

  return leads.map(lead => {
    if (lead.number || lead.country !== "DK") return lead;
    const e = enrichResults.find(r => r && normalize(r.leadName) === normalize(lead.name));
    if (!e) return lead;
    const newSources = [...(lead.sources || [])];
    if (!newSources.includes("CVR")) newSources.push("CVR");
    const sd = { ...(lead.source_details || {}) };
    if (!lead.phone && e.phone) sd.phone_source = sd.phone_source || "CVR";
    if (!lead.email && e.email) sd.email_source = sd.email_source || "CVR";
    return {
      ...lead,
      number: e.cvr || lead.number,
      email: lead.email || e.email,
      phone: lead.phone || normalizePhoneNumber(e.phone),
      industry: lead.industry || e.industry,
      address: lead.address || e.address,
      city: lead.city || e.city,
      website: lead.website || e.website,
      source: newSources.join(" + "),
      sources: newSources,
      source_details: sd,
      phone_confidence: !lead.phone && e.phone ? "high" : lead.phone_confidence,
      email_confidence: !lead.email && e.email ? "high" : lead.email_confidence,
    };
  });
}

// ═══════════════════════════════════════════════════════════
// CROSS-SOURCE DEDUPLICATION & MERGE
// ═══════════════════════════════════════════════════════════
function normalize(str: string): string {
  return (str || "").toLowerCase().replace(/[^a-zæøåäöü0-9]/g, "").trim();
}
function normalizePhone(phone: string): string {
  return (phone || "").replace(/[^0-9+]/g, "").replace(/^(\+45|\+46|\+47|\+44|\+1|0045)/, "");
}
function normalizeDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch { return normalize(url); }
}

function areDuplicates(a: any, b: any): boolean {
  if (a.number && b.number && a.number === b.number) return true;
  const nameA = normalize(a.name), nameB = normalize(b.name);
  if (nameA && nameB && nameA.length > 3 && nameB.length > 3) {
    if (nameA === nameB) return true;
    if (nameA.includes(nameB) || nameB.includes(nameA)) {
      const cityA = normalize(a.city || a.address), cityB = normalize(b.city || b.address);
      if (cityA && cityB && (cityA.includes(cityB) || cityB.includes(cityA))) return true;
    }
  }
  const phoneA = normalizePhone(a.phone), phoneB = normalizePhone(b.phone);
  if (phoneA && phoneB && phoneA.length >= 8 && phoneA === phoneB) return true;
  if (a.website && b.website) {
    const domA = normalizeDomain(a.website), domB = normalizeDomain(b.website);
    if (domA && domB && domA === domB) return true;
  }
  return false;
}

// Data priority: Krak > Google > Website > CVR for phone/address
// Email: Website > CVR > Krak > Google
const SOURCE_PRIORITY: Record<string, number> = { "Krak": 4, "Google": 3, "CVR": 2, "Website": 1 };

function mergeLeadData(existing: any, incoming: any): any {
  const merged = { ...existing };
  const existingSources = existing.sources || [];
  const incomingSources = incoming.sources || [];
  merged.sources = [...new Set([...existingSources, ...incomingSources])];

  const sd = { ...(existing.source_details || {}) };

  // Phone: Krak > CVR > Google > Website
  if (incoming.phone && (!existing.phone || SOURCE_PRIORITY[incoming.source_details?.phone_source || ""] > SOURCE_PRIORITY[sd.phone_source || ""])) {
    merged.phone = incoming.phone;
    merged.phone_confidence = incoming.phone_confidence;
    sd.phone_source = incoming.source_details?.phone_source || incoming.source;
  }

  // Address: Krak > Google > Website
  if (incoming.address && (!existing.address || SOURCE_PRIORITY[incoming.source_details?.address_source || ""] > SOURCE_PRIORITY[sd.address_source || ""])) {
    merged.address = incoming.address;
    merged.city = incoming.city || existing.city;
    sd.address_source = incoming.source_details?.address_source || incoming.source;
  }

  // Email: Website > CVR > Krak > Google (prefer scraped emails)
  const emailPriority: Record<string, number> = { "Website": 4, "CVR": 3, "Krak": 2, "Google": 1 };
  if (incoming.email && (!existing.email || emailPriority[incoming.source_details?.email_source || ""] > emailPriority[sd.email_source || ""])) {
    merged.email = incoming.email;
    merged.email_confidence = incoming.email_confidence;
    sd.email_source = incoming.source_details?.email_source || incoming.source;
  }

  // Website: prefer the most official-looking one
  if (incoming.website && !existing.website) merged.website = incoming.website;

  // CVR number
  if (incoming.number && !existing.number) merged.number = incoming.number;

  // Industry
  if (incoming.industry && !existing.industry) merged.industry = incoming.industry;

  // Rating/reviews from Google
  if (incoming.rating && !existing.rating) { merged.rating = incoming.rating; merged.reviews = incoming.reviews; }

  merged.source = merged.sources.join(" + ");
  merged.source_details = sd;

  // Recalculate data quality
  const hasPhone = !!merged.phone;
  const hasEmail = !!merged.email;
  const hasCVR = !!merged.number;
  merged.data_quality = (hasPhone && hasEmail && hasCVR) ? "high" : (hasPhone || hasEmail) ? "medium" : "low";

  return merged;
}

function mergeDuplicatesCrossSources(leads: any[]): any[] {
  const merged: any[] = [];
  for (const lead of leads) {
    let foundDupe = false;
    for (let i = 0; i < merged.length; i++) {
      if (areDuplicates(merged[i], lead)) {
        merged[i] = mergeLeadData(merged[i], lead);
        foundDupe = true;
        break;
      }
    }
    if (!foundDupe) merged.push({ ...lead });
  }
  return merged;
}

// ─── Phone Number Normalization ─────────────────────────────
function normalizePhoneNumber(phone: string): string {
  if (!phone) return "";
  let cleaned = phone.replace(/[\s.-]/g, "");
  if (/^\d{8}$/.test(cleaned)) cleaned = `+45${cleaned}`;
  if (cleaned.startsWith("+45") && cleaned.length === 11) {
    return `+45 ${cleaned.slice(3, 5)} ${cleaned.slice(5, 7)} ${cleaned.slice(7, 9)} ${cleaned.slice(9, 11)}`;
  }
  return cleaned;
}

// ─── Scoring ────────────────────────────────────────────────
function scoreAndRank(leads: any[], intent: {
  category: string; location: string; expandedTerms: string[];
  requireEmail: boolean; requirePhone: boolean;
}): any[] {
  const locationLower = intent.location?.toLowerCase() || "";
  const categoryTerms = intent.expandedTerms.map(t => t.toLowerCase());

  return leads
    .map(lead => {
      let score = 5;
      const match_reasons: string[] = [];

      const leadLocation = `${lead.address || ""} ${lead.city || ""}`.toLowerCase();
      if (locationLower && leadLocation.includes(locationLower)) {
        score += 2;
        match_reasons.push(`📍 ${intent.location}`);
      }

      if (categoryTerms.length) {
        const searchableText = `${lead.industry || ""} ${lead.type || ""} ${lead.name || ""}`.toLowerCase();
        if (categoryTerms.some(t => searchableText.includes(t))) {
          score += 2;
          match_reasons.push("🏷️ Branche match");
        }
      }

      if (lead.email) { score += 1; match_reasons.push("✉️ Email"); }
      if (lead.phone) { score += 0.5; match_reasons.push("📞 Telefon"); }
      if (lead.website) { score += 0.5; match_reasons.push("🌐 Website"); }
      if (lead.rating && lead.rating >= 4) { score += 0.5; match_reasons.push(`⭐ ${lead.rating}`); }
      if (lead.reviews && lead.reviews >= 10) { score += 0.5; }

      const statusLower = (lead.status || "").toLowerCase();
      if (["ophørt", "permanent lukket"].includes(statusLower)) {
        score -= 3;
        match_reasons.push("⚠️ Lukket");
      } else if (["aktiv", "active"].includes(statusLower)) {
        score += 1;
        match_reasons.push("✅ Aktiv");
      }

      if (lead.phone_confidence === "high") score += 0.5;
      if (lead.email_confidence === "high") score += 0.5;

      // Multi-source bonus
      if (lead.sources?.length >= 2) { score += 1; match_reasons.push(`🔗 ${lead.sources.length} kilder`); }
      if (lead.sources?.includes("Krak")) match_reasons.push("📞 Krak");
      if (lead.sources?.includes("Google")) match_reasons.push("🗺️ Google");

      score = Math.max(1, Math.min(10, Math.round(score)));
      return { ...lead, score, match_reasons, phone: normalizePhoneNumber(lead.phone) };
    })
    .filter(lead => {
      if (intent.requireEmail && !lead.email) return false;
      if (intent.requirePhone && !lead.phone) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score);
}

// ─── AI-Powered Lead Qualification ─────────────────────────
async function aiQualifyLeads(
  leads: any[],
  category: string,
  location: string,
  onProgress?: (msg: string) => void,
): Promise<any[]> {
  if (leads.length === 0) return leads;

  const LOVABLE_API_KEY = (Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
  if (!LOVABLE_API_KEY) {
    console.error("LOVABLE_API_KEY not available for AI qualification");
    return leads;
  }

  onProgress?.("🤖 AI kvalificerer leads...");

  // Batch leads into chunks of 15 for AI processing
  const BATCH_SIZE = 15;
  const qualified: any[] = [];

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const leadsForAI = batch.map((l, idx) => ({
      idx,
      name: l.name,
      phone: l.phone || "",
      email: l.email || "",
      website: l.website || "",
      address: l.address || "",
      city: l.city || "",
      cvr: l.number || "",
      industry: l.industry || "",
      rating: l.rating || null,
      reviews: l.reviews || 0,
      sources: l.sources || [],
      status: l.status || "",
    }));

    try {
      const aiRes = await fetchWithTimeout(
        (Deno.env.get("AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions"),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama3.2:3b",
            messages: [
              {
                role: "system",
                content: `Du er en lead-kvalificeringsekspert for danske virksomheder. Analysér disse leads og giv hver en kvalificering.

Brugeren søger: "${category}" ${location ? `i ${location}` : ""}

For HVERT lead, vurdér:
1. **Relevans** (0-3): Matcher virksomheden søgekategorien?
2. **Datakvalitet** (0-3): Har den telefon, email, CVR, adresse?
3. **Troværdighed** (0-2): Flere kilder, gode anmeldelser, aktiv status?
4. **Lokation** (0-2): Matcher den den ønskede lokation?

Svar KUN med JSON array:
[{"idx":0,"score":8,"quality":"high","reason":"Relevant tømrer i Aarhus med fuld kontaktdata fra 2 kilder"},...]

quality: "high" (score 7-10), "medium" (score 4-6), "low" (score 0-3)
Vær kort i reason (maks 15 ord).`,
              },
              {
                role: "user",
                content: JSON.stringify(leadsForAI),
              },
            ],
            max_tokens: 2000,
            temperature: 0,
          }),
        },
        15000,
      );

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const aiContent = aiData.choices?.[0]?.message?.content || "";
        const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const scores = JSON.parse(jsonMatch[0]);
          for (const s of scores) {
            if (typeof s.idx === "number" && s.idx < batch.length) {
              batch[s.idx].ai_score = s.score || batch[s.idx].score;
              batch[s.idx].ai_quality = s.quality || batch[s.idx].data_quality;
              batch[s.idx].ai_reason = s.reason || "";
              // Blend AI score with existing score
              const existingScore = batch[s.idx].score || 5;
              batch[s.idx].score = Math.round((existingScore + (s.score || existingScore)) / 2);
              batch[s.idx].data_quality = s.quality || batch[s.idx].data_quality;
            }
          }
        }
      } else {
        console.error("AI qualification failed:", aiRes.status);
      }
    } catch (e) {
      console.error("AI qualification error:", e);
      // Continue with existing scores
    }

    qualified.push(...batch);
    onProgress?.(`🤖 AI kvalificeret ${Math.min(i + BATCH_SIZE, leads.length)}/${leads.length} leads`);
  }

  // Re-sort by blended score
  qualified.sort((a, b) => (b.score || 0) - (a.score || 0));
  onProgress?.(`✅ AI kvalificering fuldført`);
  return qualified;
}

// ─── Analysis ───────────────────────────────────────────────
function instantAnalysis(leads: any[]): string {
  const withEmail = leads.filter(l => l.email).length;
  const withPhone = leads.filter(l => l.phone).length;
  const withCVR = leads.filter(l => l.number).length;
  const activeCount = leads.filter(l => (l.status || "").toLowerCase() === "aktiv").length;
  const highQuality = leads.filter(l => l.ai_quality === "high" || l.data_quality === "high").length;

  const lines: string[] = [];
  lines.push(`**Kontaktdata:** ${withPhone} med telefon · ${withEmail} med email · ${withCVR} med CVR · ${activeCount} aktive`);
  lines.push(`**Kilde:** Google Maps`);
  if (highQuality > 0) lines.push(`**AI kvalitet:** ${highQuality} høj kvalitet leads`);
  return lines.join("\n");
}

// ─── SSE Helper ─────────────────────────────────────────────
function sseEvent(type: string, data: any): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`;
}

// ─── Region config ──────────────────────────────────────────
const REGION_CITIES: Record<string, string[]> = {
  nordjylland: ["Aalborg", "Hjørring", "Frederikshavn", "Thisted", "Brønderslev"],
  sønderjylland: ["Sønderborg", "Aabenraa", "Haderslev", "Tønder"],
  midtjylland: ["Aarhus", "Randers", "Viborg", "Herning", "Silkeborg"],
  sjælland: ["København", "Roskilde", "Næstved", "Slagelse", "Køge"],
  fyn: ["Odense", "Svendborg", "Nyborg"],
  vestjylland: ["Esbjerg", "Varde", "Holstebro", "Struer"],
  østjylland: ["Aarhus", "Randers", "Horsens", "Skanderborg"],
  danmark: ["København", "Aarhus", "Odense", "Aalborg", "Esbjerg"],
};

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = (Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json();

    // ─── Structured search mode (from form) ─────────────────
    if (body.mode === "structured") {
      const { category, location, maxResults: targetMax = 50, filters: searchFilters = {} } = body;
      if (!category) {
        return new Response(JSON.stringify({ error: "Branche er påkrævet" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isSpecific = !CATEGORY_MAP[category.toLowerCase().trim()] && !isGenericSearch(category);
      const expandedTerms = expandCategory(category);
      // Use more search queries for larger requests to maximize coverage
      const maxQueryVariants = targetMax >= 100 ? 5 : targetMax >= 50 ? 3 : 2;
      const searchQueries = isSpecific
        ? [category]
        : [...new Set([category, ...expandedTerms.slice(0, maxQueryVariants)])].slice(0, maxQueryVariants + 1);

      const locationLower = (location || "").toLowerCase().trim();
      const regionCities = REGION_CITIES[locationLower];
      const isRegion = !!regionCities;

      // STRICT: No auto-expansion to nearby cities. Only search the exact location the user requested.

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (type: string, data: any) => {
            try { controller.enqueue(encoder.encode(sseEvent(type, data))); } catch { /* closed */ }
          };

          send("status", { step: "searching", message: `🔍 Søger efter ${category} ${location ? `i ${location}` : ""}...` });

          // ═══ GOOGLE MAPS ONLY ═══
          send("status", { step: "google", message: `🗺️ Søger i Google Maps...` });

          let googleResults: any[] = [];
          try {
            if (isRegion) {
              const cityResults = await Promise.all(
                regionCities!.slice(0, 4).map(async city => {
                  return searchGoogleMaps(searchQueries, city, Math.ceil(targetMax / regionCities!.length), (msg) => {
                    send("progress", { message: `📍 ${city}: ${msg}` });
                  });
                }),
              );
              googleResults = cityResults.flat();
            } else {
              googleResults = await searchGoogleMaps(searchQueries, location || "", targetMax, msg => {
                send("progress", { message: msg });
              });
            }
          } catch (e) {
            console.error("Google search error:", e);
          }

      const totalRaw = googleResults.length;
          send("status", { step: "processing", message: `⚙️ Samler ${totalRaw} resultater fra Google Maps...` });

          if (totalRaw === 0) {
            send("done", { message: `Ingen virksomheder fundet for "${category}" ${location ? `i ${location}` : ""}.`, leads: [], search_meta: { category, location, total_raw: 0, total_filtered: 0 } });
            controller.close();
            return;
          }

          // Deduplication
          send("status", { step: "deduping", message: `🔗 Deduplicerer resultater...` });
          const deduped = mergeDuplicatesCrossSources(googleResults);

          let scored = scoreAndRank(deduped, {
            category, location: location || "", expandedTerms,
            requireEmail: searchFilters.requireEmail || false,
            requirePhone: searchFilters.requirePhone || false,
          });

          send("status", { step: "deduped", message: `✅ ${scored.length} unikke virksomheder fra Google Maps` });
          send("leads_batch", { leads: scored.slice(0, targetMax) });

          // ═══ MINIMUM ENFORCEMENT (50 leads) ═══
          // If fewer unique results than requested, try broader queries
          const minimumTarget = Math.max(targetMax, 50);
          if (scored.length < minimumTarget && scored.length < targetMax) {
            send("status", { step: "retry_broader", message: `⚠️ Kun ${scored.length} fundet — forsøger bredere søgning...` });
            // Retry with more query variants to maximize coverage
            const broaderQueries = [...new Set([
              category,
              ...expandedTerms,
              ...(expandedTerms.length === 1 ? [`${category} service`, `${category} firma`] : []),
            ])].slice(0, 8);
            try {
              const extraResults = await searchGoogleMaps(
                broaderQueries.filter(q => !searchQueries.includes(q)),
                location || "",
                minimumTarget - scored.length,
                msg => send("progress", { message: `🔄 ${msg}` }),
              );
              if (extraResults.length > 0) {
                const combined = mergeDuplicatesCrossSources([...scored.map(s => ({ ...s })), ...extraResults]);
                scored = scoreAndRank(combined, {
                  category, location: location || "", expandedTerms: [...expandedTerms, ...broaderQueries],
                  requireEmail: searchFilters.requireEmail || false,
                  requirePhone: searchFilters.requirePhone || false,
                });
                send("status", { step: "retry_done", message: `✅ Nu ${scored.length} virksomheder efter bredere søgning` });
              }
            } catch { /* continue with what we have */ }
          }

          // Enrichment: Website scraping then CVR for ALL leads
          send("status", { step: "enriching", message: `🌐 Beriger med kontaktdata...` });
          scored = await enrichLeadContacts(scored, msg => send("progress", { message: msg }));

          send("status", { step: "cvr", message: `🏢 Slår CVR op for alle leads...` });
          scored = await enrichWithCVR(scored, msg => send("progress", { message: msg }));

          // Merge CVR data into leads
          send("status", { step: "cvr_done", message: `✅ CVR-berigelse fuldført` });

          // AI-powered lead qualification
          send("status", { step: "ai_qualify", message: `🤖 AI kvalificerer leads...` });
          scored = await aiQualifyLeads(scored, category, location || "", msg => send("progress", { message: msg }));

          // Apply requested count
          scored = scored.slice(0, targetMax);

          // Post-enrichment filters
          if (searchFilters.onlyWithPhone) scored = scored.filter(l => l.phone);
          if (searchFilters.onlyWithEmail) scored = scored.filter(l => l.email);
          if (searchFilters.onlyWithWebsite) scored = scored.filter(l => l.website);

          // ═══ MINIMUM WARNING ═══
          // If still fewer than requested, warn the user
          const shortfall = targetMax - scored.length;
          let minimumWarning = "";
          if (shortfall > 0 && scored.length > 0) {
            minimumWarning = `\n\n⚠️ **Bemærk:** Du bad om ${targetMax} leads, men der blev kun fundet ${scored.length} præcise matches på Google Maps i ${location || "det valgte område"}. Mangler ${shortfall} for at nå dit krav. Prøv at udvide til nærliggende områder eller lignende brancher.`;
          }

          const analysis = instantAnalysis(scored);
          const searchMeta = {
            category,
            location: location || "",
            expanded_terms: isSpecific ? [category] : [...new Set([category, ...expandedTerms])].slice(0, 8),
            total_raw: totalRaw,
            total_deduped: deduped.length,
            total_filtered: scored.length,
            requested_count: targetMax,
            shortfall: shortfall > 0 ? shortfall : 0,
            sources_used: [...new Set(scored.flatMap(l => l.sources || []))],
            source_counts: {
              google: scored.filter(l => l.sources?.includes("Google")).length,
              krak: scored.filter(l => l.sources?.includes("Krak")).length,
              website: scored.filter(l => l.sources?.includes("Website")).length,
              cvr: scored.filter(l => l.sources?.includes("CVR")).length,
            },
          };

          send("leads_final", { leads: scored, search_meta: searchMeta });
          send("done", { message: `Fandt **${scored.length} virksomheder** ${location ? `i ${location}` : ""}.\n\n${analysis}${minimumWarning}`, leads: scored, search_meta: searchMeta });
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
      });
    }

    // ─── Chat-based search mode (legacy) ────────────────────
    const { messages, previousResults, stream: useStream } = body;
    const userMessage = messages?.[messages.length - 1]?.content || "";

    const contextNote = previousResults
      ? `\n\nKONTEKST: Brugeren har allerede søgeresultater med ${previousResults.count} leads for "${previousResults.category}" i "${previousResults.location}". Hvis brugeren stiller opfølgende spørgsmål om disse resultater, sæt needs_search=false og giv et chat_response. Hvis de beder om en NY søgning, sæt needs_search=true.`
      : "";

    const parseResponse = await fetch((Deno.env.get("AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions"), {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2:3b",
        messages: [
          {
            role: "system",
            content: `Du er en søgeparser for et CRM lead-generation system. Analysér brugerens besked og udled søgeparametre.

Svar KUN med JSON:
{
  "needs_search": true|false,
  "chat_response": "besked hvis needs_search er false",
  "intent": {
    "category": "branchekategori ELLER 'virksomheder' hvis generisk",
    "location": "by/område/region",
    "country": "DK",
    "require_email": false,
    "require_phone": false,
    "max_results": 0,
    "raw_query": "den præcise søgetekst brugeren brugte",
    "is_company_name": false,
    "is_specific_query": false
  }
}

Regler:
- "find 20 tømrere i Nordjylland" → category:"tømrer", location:"Nordjylland", max_results:20
- "virksomheder i Randers" → category:"virksomheder", location:"Randers"
- Standard er DK${contextNote}`,
          },
          ...messages,
        ],
        max_tokens: 500,
        temperature: 0,
      }),
    });

    if (!parseResponse.ok) {
      if (parseResponse.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${parseResponse.status}`);
    }

    const parseResult = await parseResponse.json();
    const content = parseResult.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return new Response(JSON.stringify({ type: "chat", message: content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.needs_search) {
      return new Response(JSON.stringify({ type: "chat", message: parsed.chat_response || "Hvordan kan jeg hjælpe dig?" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SEARCH PIPELINE (chat mode) ────────────────────────
    const intent = parsed.intent || {};
    const category = intent.category || "virksomheder";
    const location = intent.location || "";
    const rawQuery = intent.raw_query || category;
    const maxResults = intent.max_results || 0;
    const isSpecificQuery = intent.is_specific_query || false;
    const isCompanyName = intent.is_company_name || false;
    const generic = isGenericSearch(category);

    const locationLower = location.toLowerCase().trim();
    const regionCities = REGION_CITIES[locationLower];
    const isRegion = !!regionCities;

    const expandedTerms = expandCategory(category);
    const searchQueries = isCompanyName || isSpecificQuery
      ? [rawQuery]
      : generic
        ? (location ? ["virksomheder", "butikker", "restauranter", "service"] : ["virksomheder"])
        : [...new Set([rawQuery, category, ...expandedTerms.slice(0, 2)])];

    const targetMax = maxResults > 0 ? maxResults : 50;

    if (useStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (type: string, data: any) => {
            try { controller.enqueue(encoder.encode(sseEvent(type, data))); } catch { /* closed */ }
          };

          send("status", { step: "searching", message: `🔍 Søger efter ${isCompanyName || isSpecificQuery ? rawQuery : category} ${location ? `i ${location}` : ""}...` });

          // Google Maps ONLY
          let googleResults: any[] = [];
          try {
            if (isRegion) {
              const cityResults = await Promise.all(
                regionCities!.slice(0, 4).map(city =>
                  searchGoogleMaps(searchQueries, city, Math.ceil(targetMax / regionCities!.length), msg => send("progress", { message: `📍 ${city}: ${msg}` }))
                ),
              );
              googleResults = cityResults.flat();
            } else {
              googleResults = await searchGoogleMaps(searchQueries, location, targetMax, msg => send("progress", { message: msg }));
            }
          } catch { /* continue */ }

          const totalRaw = googleResults.length;

          if (totalRaw === 0) {
            send("done", { message: `Ingen virksomheder fundet.`, leads: [] });
            controller.close();
            return;
          }

          send("status", { step: "processing", message: `⚙️ Samler ${totalRaw} resultater fra Google Maps...` });
          const deduped = mergeDuplicatesCrossSources(googleResults);

          let scored = scoreAndRank(deduped, {
            category, location, expandedTerms,
            requireEmail: intent.require_email || false,
            requirePhone: intent.require_phone || false,
          });

          send("status", { step: "deduped", message: `✅ ${scored.length} unikke virksomheder` });
          send("leads_batch", { leads: scored.slice(0, targetMax) });

          send("status", { step: "enriching", message: `🌐 Beriger med kontaktdata...` });
          scored = await enrichLeadContacts(scored, msg => send("progress", { message: msg }));
          send("status", { step: "cvr", message: `🏢 Slår CVR op for alle leads...` });
          scored = await enrichWithCVR(scored, msg => send("progress", { message: msg }));
          send("status", { step: "cvr_done", message: `✅ CVR-berigelse fuldført` });

          // AI qualification
          send("status", { step: "ai_qualify", message: `🤖 AI kvalificerer leads...` });
          scored = await aiQualifyLeads(scored, isCompanyName ? rawQuery : category, location, msg => send("progress", { message: msg }));

          scored = maxResults > 0 ? scored.slice(0, maxResults) : scored.slice(0, 200);

          const searchMeta = {
            category: isCompanyName ? rawQuery : category,
            location,
            expanded_terms: isCompanyName ? [rawQuery] : (generic ? ["alle virksomheder"] : [...new Set([category, ...expandedTerms])].slice(0, 8)),
            total_raw: totalRaw,
            total_deduped: deduped.length,
            total_filtered: scored.length,
            sources_used: [...new Set(scored.flatMap(l => l.sources || []))],
          };

          send("leads_final", { leads: scored, search_meta: searchMeta });
          const analysis = instantAnalysis(scored);
          send("done", { message: `Fandt **${scored.length} virksomheder** ${location ? `i ${location}` : ""}.\n\n${analysis}` });
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
      });
    }

    // Non-streaming fallback — Google Maps ONLY
    let googleResults: any[] = [];
    try {
      if (isRegion) {
        const cityResults = await Promise.all(regionCities!.slice(0, 4).map(city => searchGoogleMaps(searchQueries, city, Math.ceil(targetMax / regionCities!.length))));
        googleResults = cityResults.flat();
      } else {
        googleResults = await searchGoogleMaps(searchQueries, location, targetMax);
      }
    } catch { /* continue */ }

    const totalRaw = googleResults.length;
    if (totalRaw === 0) {
      return new Response(JSON.stringify({ type: "chat", message: `Ingen virksomheder fundet.` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const deduped = mergeDuplicatesCrossSources(googleResults);
    let scored = scoreAndRank(deduped, {
      category, location, expandedTerms,
      requireEmail: intent.require_email || false,
      requirePhone: intent.require_phone || false,
    });

    scored = await enrichLeadContacts(scored);
    scored = await enrichWithCVR(scored);
    scored = await aiQualifyLeads(scored, category, location);
    scored = maxResults > 0 ? scored.slice(0, maxResults) : scored.slice(0, 200);

    const analysis = instantAnalysis(scored);

    return new Response(JSON.stringify({
      type: "leads",
      leads: scored,
      message: `Fandt **${scored.length} virksomheder** ${location ? `i ${location}` : ""}.\n\n${analysis}`,
      search_meta: {
        category: isCompanyName ? rawQuery : category,
        location,
        expanded_terms: isCompanyName ? [rawQuery] : (generic ? ["alle virksomheder"] : [...new Set([category, ...expandedTerms])].slice(0, 8)),
        total_raw: totalRaw,
        total_deduped: deduped.length,
        total_filtered: scored.length,
        sources_used: [...new Set(scored.flatMap(l => l.sources || []))],
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("lead-generation-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
