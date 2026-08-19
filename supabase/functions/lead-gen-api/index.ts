import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-tenant-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") || "";
const APIFY_API_TOKEN = Deno.env.get("APIFY_API_TOKEN") || "";
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") || "";

const WORKER_DEADLINE_MS = 140_000; // 2m20s — close to Deno's hard limit
const STUCK_SESSION_THRESHOLD_MS = 3 * 60 * 1000;

// ─── Helpers ────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

function nowIso() { return new Date().toISOString(); }
function elapsedMs(start: number) { return Date.now() - start; }
function timeLeftMs(start: number) { return WORKER_DEADLINE_MS - elapsedMs(start); }

function normalizeUserQuery(input: string): string {
  return input.trim()
    .replace(/^\s*(find|finde|søg|sog|hent|get)\s+\d+\s+/i, "")
    .replace(/^\s*(find|finde|søg|sog|hent|get)\s+/i, "")
    .replace(/\s+/g, " ").trim();
}

async function fetchWithTimeout(url: string, opts: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 4000, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function getAuthContext(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Unauthorized");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");
  const { data: profile } = await supabase
    .from("profiles").select("company_id").eq("user_id", user.id).single();
  if (!profile?.company_id) throw new Error("No company associated");
  return { userId: user.id, companyId: profile.company_id, supabase };
}

// ─── Email Validation ───────────────────────────────────────

function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email);
}

const KNOWN_GOOD_DOMAINS = new Set([
  "gmail.com","outlook.com","yahoo.com","hotmail.com","icloud.com","aol.com",
  "protonmail.com","zoho.com","mail.com","gmx.com","yandex.com","live.com",
  "me.com","msn.com","comcast.net","att.net","verizon.net",
]);

const JUNK_DOMAINS = new Set([
  "example.com","example.org","example.net","test.com","test.org",
  "wixpress.com","sentry.io","squarespace.com","wix.com","weebly.com",
  "wordpress.com","blogspot.com","tumblr.com","herokuapp.com",
  "godaddy.com","namecheap.com","hostinger.com","bluehost.com",
  "placeholder.com","noreply.com","no-reply.com","donotreply.com",
  "mailinator.com","guerrillamail.com","tempmail.com","throwaway.email",
  "sharklasers.com","guerrillamailblock.com","grr.la","temp-mail.org",
  "fakeinbox.com","10minutemail.com","yopmail.com","trashmail.com",
]);

const ROLE_PREFIXES = new Set([
  "noreply","no-reply","donotreply","mailer-daemon","postmaster",
  "webmaster","abuse","spam","bounce","unsubscribe",
]);

const PREFERRED_PREFIXES = ["contact","hello","info","office","sales","support","admin"];

// DNS caches
const mxCache = new Map<string, boolean>();
const spfCache = new Map<string, boolean>();

async function hasMxRecord(domain: string): Promise<boolean> {
  if (mxCache.has(domain)) return mxCache.get(domain)!;
  if (KNOWN_GOOD_DOMAINS.has(domain)) { mxCache.set(domain, true); return true; }
  if (JUNK_DOMAINS.has(domain)) { mxCache.set(domain, false); return false; }
  try {
    const records = await Deno.resolveDns(domain, "MX");
    const valid = records && records.length > 0;
    mxCache.set(domain, valid);
    return valid;
  } catch {
    // Fallback to A record check
    try {
      const aRecs = await Deno.resolveDns(domain, "A");
      const valid = aRecs && aRecs.length > 0;
      mxCache.set(domain, valid);
      return valid;
    } catch {
      mxCache.set(domain, false);
      return false;
    }
  }
}

async function hasSpfRecord(domain: string): Promise<boolean> {
  if (spfCache.has(domain)) return spfCache.get(domain)!;
  if (KNOWN_GOOD_DOMAINS.has(domain)) { spfCache.set(domain, true); return true; }
  try {
    const txt = await Deno.resolveDns(domain, "TXT");
    const hasSPF = txt.some((records: string[]) =>
      records.some((r: string) => r.startsWith("v=spf1"))
    );
    spfCache.set(domain, hasSPF);
    return hasSPF;
  } catch { spfCache.set(domain, false); return false; }
}

type EmailVerdict = "verified" | "likely_valid" | "invalid" | "missing";

async function validateEmail(email: string | null | undefined): Promise<EmailVerdict> {
  if (!email) return "missing";
  if (!isValidEmailFormat(email)) return "invalid";
  const domain = email.split("@")[1]?.toLowerCase();
  const prefix = email.split("@")[0]?.toLowerCase();
  if (!domain) return "invalid";
  if (JUNK_DOMAINS.has(domain)) return "invalid";
  if (ROLE_PREFIXES.has(prefix)) return "invalid";
  
  const hasMx = await hasMxRecord(domain);
  if (!hasMx) return "invalid";
  if (KNOWN_GOOD_DOMAINS.has(domain)) return "verified";
  
  const hasSPF = await hasSpfRecord(domain);
  if (hasSPF) return "likely_valid";
  // Has MX but no SPF — still likely valid for business domains
  return "likely_valid";
}

// ─── Domain / Email Utilities ───────────────────────────────

function extractDomainFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const normalized = website.startsWith("http") ? website : `https://${website}`;
    const host = new URL(normalized).hostname.replace(/^www\./, "").toLowerCase();
    if (!host || host.includes("google.") || host.includes("facebook.") ||
        host.includes("yelp.") || host.includes("instagram.") ||
        host.includes("twitter.") || host.includes("linkedin.")) return null;
    if (host.split(".").length < 2) return null;
    return host;
  } catch { return null; }
}

function rankEmails(emails: string[], websiteDomain: string | null): string[] {
  const domainEmails = websiteDomain
    ? emails.filter(e => e.toLowerCase().endsWith(`@${websiteDomain}`))
    : emails;
  const clean = (domainEmails.length > 0 ? domainEmails : emails).filter(e => {
    const d = e.split("@")[1]?.toLowerCase();
    const p = e.split("@")[0]?.toLowerCase();
    if (!d) return false;
    if (JUNK_DOMAINS.has(d)) return false;
    if (ROLE_PREFIXES.has(p)) return false;
    return true;
  });
  return clean.sort((a, b) => {
    const pa = a.split("@")[0].toLowerCase();
    const pb = b.split("@")[0].toLowerCase();
    const aIsPersonal = /^[a-z]+(\.[a-z]+)+$/.test(pa);
    const bIsPersonal = /^[a-z]+(\.[a-z]+)+$/.test(pb);
    if (aIsPersonal && !bIsPersonal) return -1;
    if (!aIsPersonal && bIsPersonal) return 1;
    const aIdx = PREFERRED_PREFIXES.indexOf(pa);
    const bIdx = PREFERRED_PREFIXES.indexOf(pb);
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    if (aIdx >= 0) return -1;
    if (bIdx >= 0) return 1;
    return 0;
  });
}

function classifyEmailType(email: string | null): string {
  if (!email) return "missing";
  const prefix = email.split("@")[0]?.toLowerCase();
  if (/^[a-z]+(\.[a-z]+)+$/.test(prefix)) return "personal";
  if (PREFERRED_PREFIXES.includes(prefix)) return "generic";
  if (/^[a-z]+$/.test(prefix) && prefix.length > 2) return "personal";
  return "generic";
}

function calculateEmailConfidence(emailStatus: string, emailType: string, sourceCount: number): number {
  let score = 0;
  if (emailStatus === "verified") score += 50;
  else if (emailStatus === "likely_valid") score += 40;
  if (emailType === "personal") score += 25;
  else if (emailType === "generic") score += 10;
  score += Math.min(sourceCount * 5, 25);
  return Math.min(score, 100);
}

// ─── Website Scraping (focused: 4 key pages) ────────────────

const SCRAPE_PATHS = ["/", "/contact", "/about", "/team"];

function extractEmailsFromHtml(html: string): string[] {
  const emailMatches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  return [...new Set(emailMatches.filter(e => {
    const el = e.toLowerCase();
    return !el.includes("example") && !el.includes("wixpress") &&
           !el.includes("sentry") && !el.includes(".png") &&
           !el.includes(".jpg") && !el.includes(".css") &&
           !el.includes(".js") && !el.endsWith(".webp") &&
           !el.includes("webpack") && !el.includes("node_modules") &&
           !el.includes("placeholder") && !el.includes("@2x") &&
           !el.includes("@media");
  }).map(e => e.toLowerCase()))];
}

function extractPhonesFromHtml(html: string): string[] {
  const phones: string[] = [];
  const intlMatches = html.match(
    /(?:\+1[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\+(?:45|47|44|46|49|33|34|31|39|43|41|32|48|420|351|353|358|30|36|7|61|64|65|81|82|86|91|52|55|27|971|966|972)[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,4})/g
  );
  if (intlMatches) phones.push(...intlMatches);
  if (phones.length === 0) {
    const usMatches = html.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g);
    if (usMatches) phones.push(...usMatches);
  }
  return [...new Set(phones)];
}

function extractContactPersons(html: string): { name: string; role: string }[] {
  const persons: { name: string; role: string }[] = [];
  const patterns = [
    /<(?:h[2-4]|strong|b)[^>]*>\s*([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*<\/(?:h[2-4]|strong|b)>\s*(?:<[^>]*>)*\s*(?:<(?:p|span|div)[^>]*>\s*((?:CEO|Founder|Owner|Director|Manager|Partner|Head|VP|President|CTO|CFO|COO|CMO|Principal)[^<]{0,60})\s*<)/gi,
    /(?:^|>)\s*([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*[-–|]\s*((?:CEO|Founder|Owner|Director|Manager|Partner|Head|VP|President|CTO|CFO|COO|CMO|Principal)[^<\n]{0,50})/gm,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null && persons.length < 3) {
      const name = match[1]?.trim();
      const role = match[2]?.trim();
      if (name && role && name.length > 4 && name.length < 50) persons.push({ name, role });
    }
  }
  if (persons.length === 0) {
    const ownerMatch = html.match(/(?:owned by|founded by|CEO|founder)\s*:?\s*([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i);
    if (ownerMatch?.[1]) {
      const roleMatch = html.match(/(?:CEO|founder|owner|director)/i);
      persons.push({ name: ownerMatch[1].trim(), role: roleMatch?.[0] || "Owner" });
    }
  }
  return persons;
}

function extractLinkedinUrls(html: string): { profiles: string[]; company: string | null } {
  const profileUrls: string[] = [];
  let companyUrl: string | null = null;
  const matches = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[a-zA-Z0-9_-]+\/?/g) || [];
  for (const url of matches) {
    if (url.includes("/company/")) { if (!companyUrl) companyUrl = url; }
    else if (url.includes("/in/")) profileUrls.push(url);
  }
  return { profiles: [...new Set(profileUrls)].slice(0, 3), company: companyUrl };
}

function detectTechnologies(html: string): string[] {
  const techs: string[] = [];
  const checks: [RegExp, string][] = [
    [/wordpress/i, "WordPress"], [/shopify/i, "Shopify"],
    [/wix\.com/i, "Wix"], [/squarespace/i, "Squarespace"],
    [/webflow/i, "Webflow"], [/hubspot/i, "HubSpot"],
    [/google-analytics|gtag|googletagmanager/i, "Google Analytics"],
    [/mailchimp/i, "Mailchimp"], [/stripe/i, "Stripe"],
    [/cloudflare/i, "Cloudflare"],
  ];
  for (const [re, name] of checks) {
    if (re.test(html)) techs.push(name);
  }
  return techs;
}

interface ScrapedData {
  emails: string[];
  phones: string[];
  description: string | null;
  contactPersons: { name: string; role: string }[];
  linkedinUrls: string[];
  companyLinkedin: string | null;
  technologies: string[];
  sources: string[];
}

async function scrapeWebsite(baseUrl: string): Promise<ScrapedData> {
  const allEmails = new Set<string>();
  const allPhones = new Set<string>();
  let description: string | null = null;
  const allPersons: { name: string; role: string }[] = [];
  const allLinkedinProfiles: string[] = [];
  let companyLinkedin: string | null = null;
  const allTechs = new Set<string>();
  const sources: string[] = [];

  const normalizedBase = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
  let origin: string;
  try { origin = new URL(normalizedBase).origin; } catch {
    return { emails: [], phones: [], description: null, contactPersons: [], linkedinUrls: [], companyLinkedin: null, technologies: [], sources: [] };
  }

  // Scrape key pages in parallel (only 4 pages)
  const pages = SCRAPE_PATHS.map(path => `${origin}${path}`);
  const results = await Promise.allSettled(
    pages.map(async (url) => {
      try {
        const res = await fetchWithTimeout(url, {
          timeout: 3000,
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
          redirect: "follow",
        });
        if (!res.ok) { await res.text().catch(() => {}); return null; }
        const html = await res.text();
        return { url, html: html.slice(0, 200_000) };
      } catch { return null; }
    })
  );

  let gotAnyPage = false;
  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value) continue;
    gotAnyPage = true;
    const { url, html } = result.value;
    const pathName = new URL(url).pathname;

    const emails = extractEmailsFromHtml(html);
    for (const e of emails) allEmails.add(e);
    const phones = extractPhonesFromHtml(html);
    for (const p of phones) allPhones.add(p);

    if (pathName === "/" && !description) {
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      description = descMatch?.[1] || null;
    }

    if (["/team", "/about"].includes(pathName)) {
      const persons = extractContactPersons(html);
      allPersons.push(...persons);
      if (persons.length > 0) sources.push(`team_page:${pathName}`);
    }

    const linkedin = extractLinkedinUrls(html);
    allLinkedinProfiles.push(...linkedin.profiles);
    if (linkedin.company && !companyLinkedin) companyLinkedin = linkedin.company;

    if (pathName === "/") {
      const techs = detectTechnologies(html);
      for (const t of techs) allTechs.add(t);
    }

    if (emails.length > 0 || phones.length > 0) sources.push(`website:${pathName}`);
  }

  // Firecrawl scrape fallback — if raw fetch got no emails, try Firecrawl regardless
  if (allEmails.size === 0 && FIRECRAWL_API_KEY) {
    try {
      const fcRes = await fetchWithTimeout("https://api.firecrawl.dev/v1/scrape", {
        timeout: 15_000,
        method: "POST",
        headers: {
          "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: origin, formats: ["markdown"], onlyMainContent: false }),
      });
      if (fcRes.ok) {
        const fcData = await fcRes.json();
        const md = fcData?.data?.markdown || fcData?.markdown || "";
        if (md) {
          const emails = extractEmailsFromHtml(md);
          for (const e of emails) allEmails.add(e);
          const phones = extractPhonesFromHtml(md);
          for (const p of phones) allPhones.add(p);
          if (emails.length > 0 || phones.length > 0) sources.push("firecrawl_scrape");
        }
      } else { await fcRes.text().catch(() => {}); }
    } catch { /* Firecrawl scrape fallback failed silently */ }
  }

  return {
    emails: Array.from(allEmails),
    phones: Array.from(allPhones),
    description,
    contactPersons: allPersons.slice(0, 3),
    linkedinUrls: [...new Set(allLinkedinProfiles)].slice(0, 3),
    companyLinkedin,
    technologies: Array.from(allTechs),
    sources: [...new Set(sources)],
  };
}

// ─── AI Query Expansion ─────────────────────────────────────

async function aiExpandQuery(query: string): Promise<string[]> {
  const LOVABLE_API_KEY = (Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
  if (!LOVABLE_API_KEY) return [query];
  try {
    const response = await fetchWithTimeout((Deno.env.get("AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions"), {
      timeout: 8000,
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{
          role: "system",
          content: `You are a B2B lead generation expert. Expand the search query into 15-20 highly specific sub-niches, synonyms, and related service types that real businesses would use in their names or descriptions. Include the original query. Focus on variations customers would actually search for. Return ONLY a JSON array.

Example: "plumbers" → ["plumbers","plumbing contractors","emergency plumber","drain cleaning services","pipe repair","water heater installation","bathroom plumbing","commercial plumbing","residential plumber","sewer repair","plumbing maintenance","gas plumber","boiler repair","leak detection","water pump services","plumbing and heating"]`
        }, { role: "user", content: query }],
        temperature: 0.4,
        max_tokens: 600,
      }),
    });
    if (!response.ok) { await response.text().catch(() => {}); return [query]; }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const match = content.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return [...new Set([query, ...parsed.map((s: string) => s.trim()).filter(Boolean)])].slice(0, 18);
      }
    }
    return [query];
  } catch (e) {
    console.warn("AI query expansion failed:", e);
    return [query];
  }
}

// ─── Scoring & Quality Assessment ───────────────────────────

function scoreLead(r: Record<string, unknown>): number {
  let score = 0;
  const emailStatus = r.email_status as string;
  const emailType = r.email_type as string;

  // Email quality (max 35)
  if (emailStatus === "verified") score += 35;
  else if (emailStatus === "likely_valid") score += 25;
  else if (emailStatus === "catch_all") score += 15;
  if (emailType === "personal") score += 5;

  // Contact enrichment (max 20)
  if (r.contact_person_name) score += 12;
  if (r.contact_role) score += 3;
  if (r.linkedin_url || r.company_linkedin) score += 5;

  // Reachability (max 25) — phone+website are very valuable even without email
  if (r.phone) score += 15;
  if (r.website) score += 7;
  if (r.address) score += 3;

  // Social proof (max 12)
  const reviewCount = r.review_count as number || 0;
  const rating = r.rating as number || 0;
  if (reviewCount > 100 && rating >= 4.0) score += 12;
  else if (reviewCount > 50 && rating >= 4.0) score += 10;
  else if (reviewCount > 20 && rating >= 3.5) score += 7;
  else if (reviewCount > 5) score += 4;
  else if (reviewCount > 0) score += 2;

  // Digital maturity (max 8)
  const techs = r.technologies_detected as string[] || [];
  if (techs.length >= 3) score += 8;
  else if (techs.length >= 1) score += 4;
  const sources = r.source_list as string[] || [];
  if (sources.length >= 3) score += 2; // multi-source validated

  return Math.min(score, 100);
}

function qualifyLead(score: number): "hot" | "warm" | "cold" {
  if (score >= 60) return "hot";
  if (score >= 35) return "warm";
  return "cold";
}

const AUTO_REJECT_THRESHOLD = 15; // Only skip truly useless leads

// ─── Place Types ────────────────────────────────────────────

interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  business_status?: string;
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  url?: string | null;
}

function countryDisplayName(country: string) {
  const map: Record<string, string> = {
    dk: "Denmark", no: "Norway", se: "Sweden", de: "Germany",
    gb: "United Kingdom", uk: "United Kingdom", us: "United States",
    nl: "Netherlands", be: "Belgium", fr: "France", es: "Spain",
    it: "Italy", at: "Austria", ch: "Switzerland", pl: "Poland",
    ie: "Ireland", fi: "Finland", pt: "Portugal", cz: "Czech Republic",
    au: "Australia", nz: "New Zealand", ca: "Canada", sg: "Singapore",
    ae: "United Arab Emirates", sa: "Saudi Arabia", il: "Israel",
    za: "South Africa", br: "Brazil", mx: "Mexico", "in": "India",
    jp: "Japan", kr: "South Korea",
  };
  return map[country.toLowerCase()] || country;
}

function getMajorCities(country: string): string[] {
  const map: Record<string, string[]> = {
    dk: ["København","Aarhus","Odense","Aalborg","Esbjerg","Randers","Kolding","Horsens","Vejle","Roskilde"],
    no: ["Oslo","Bergen","Trondheim","Stavanger","Drammen","Fredrikstad","Kristiansand","Tromsø"],
    se: ["Stockholm","Göteborg","Malmö","Uppsala","Västerås","Örebro","Linköping"],
    de: ["Berlin","Hamburg","München","Köln","Frankfurt","Stuttgart","Düsseldorf","Leipzig","Dortmund"],
    gb: ["London","Manchester","Birmingham","Leeds","Glasgow","Liverpool","Bristol","Edinburgh"],
    uk: ["London","Manchester","Birmingham","Leeds","Glasgow","Liverpool","Bristol","Edinburgh"],
    us: ["New York","Los Angeles","Chicago","Houston","Phoenix","Philadelphia","San Antonio","San Diego","Dallas","San Jose","Austin","Jacksonville","San Francisco","Seattle","Denver","Boston","Nashville","Miami","Atlanta","Portland"],
    nl: ["Amsterdam","Rotterdam","Den Haag","Utrecht","Eindhoven","Groningen"],
    fr: ["Paris","Marseille","Lyon","Toulouse","Nice","Nantes","Strasbourg","Bordeaux"],
    es: ["Madrid","Barcelona","Valencia","Seville","Zaragoza","Málaga","Bilbao"],
    it: ["Rome","Milan","Naples","Turin","Palermo","Genoa","Bologna","Florence"],
    au: ["Sydney","Melbourne","Brisbane","Perth","Adelaide","Gold Coast","Canberra"],
    ca: ["Toronto","Montreal","Vancouver","Calgary","Edmonton","Ottawa","Winnipeg"],
  };
  return map[country.toLowerCase()] || [];
}

// If the user typed a city inline in the query ("tandlæge i København")
// instead of using the separate city filter, honor it anyway — otherwise
// the geo term only survives by chance inside whichever AI-expanded query
// variants happen to keep it, and the wide "search every major city too"
// net below drowns it out.
function extractCityFromQuery(query: string, country: string): string | undefined {
  const words = query.toLowerCase();
  for (const city of getMajorCities(country)) {
    if (new RegExp(`\\b${city.toLowerCase()}\\b`).test(words)) return city;
  }
  return undefined;
}

// ─── Firecrawl Search (PRIMARY source) ──────────────────────

interface FirecrawlItem {
  title?: string;
  url?: string;
  description?: string;
  markdown?: string;
}

function parseFirecrawlResult(item: FirecrawlItem, searchQuery: string): PlaceResult | null {
  const title = item.title || "";
  const url = item.url || "";
  const description = item.description || "";

  // Skip irrelevant results (directories, social media, etc.)
  if (!title || title.length < 3) return null;
  const skipDomains = ["facebook.com", "instagram.com", "twitter.com", "linkedin.com",
    "yelp.com", "yellowpages.com", "tripadvisor.com", "wikipedia.org", "reddit.com",
    "youtube.com", "tiktok.com", "pinterest.com"];
  if (skipDomains.some(d => url.includes(d))) return null;

  // Extract domain as website
  let website: string | null = null;
  try {
    const parsed = new URL(url);
    website = parsed.origin;
  } catch { website = url; }

  // Try to extract phone from description
  const phoneMatch = description.match(/(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/);
  const phone = phoneMatch ? phoneMatch[0] : null;

  // Try to extract address from description
  const addressPatterns = [
    /(\d+\s+[A-Za-zæøåÆØÅäöüÄÖÜ\s.]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl|Court|Ct|Vej|Gade|Allé|Plads|Straße|Str|Weg)[.,]?\s*(?:[A-Za-zæøåÆØÅäöüÄÖÜ\s]+)?(?:\d{4,5})?)/i,
  ];
  let address: string | null = null;
  for (const p of addressPatterns) {
    const m = description.match(p);
    if (m) { address = m[1].trim(); break; }
  }

  return {
    place_id: `firecrawl:${url}`,
    name: title.replace(/\s*[-|–].*$/, "").trim().slice(0, 100), // Clean title
    formatted_address: address || "",
    business_status: "OPERATIONAL",
    types: [],
    rating: null,
    user_ratings_total: 0,
    website,
    email: null,
    phone,
    url,
  };
}

async function searchViaFirecrawl(
  queryVariants: string[], country: string, city: string | undefined
): Promise<PlaceResult[]> {
  if (!FIRECRAWL_API_KEY) return [];

  const countryName = countryDisplayName(country);
  const location = city ? `${city}, ${countryName}` : countryName;

  // Build search queries — maximize coverage
  const searchQueries: string[] = [];
  for (const variant of queryVariants.slice(0, 12)) {
    searchQueries.push(`${variant} ${location}`);
    if (city) {
      searchQueries.push(`${variant} near ${city}`);
      searchQueries.push(`best ${variant} ${city}`);
    }
    searchQueries.push(`${variant} ${countryName}`);
  }
  // Add city variants — use up to 8 major cities
  const majorCities = getMajorCities(country);
  for (const variant of queryVariants.slice(0, 6)) {
    for (const majorCity of majorCities.slice(0, 8)) {
      if (majorCity.toLowerCase() !== (city || "").toLowerCase()) {
        searchQueries.push(`${variant} ${majorCity}`);
      }
    }
  }

  const uniqueQueries = [...new Set(searchQueries)];
  console.log(`Firecrawl: ${uniqueQueries.length} search queries`);

  const unique = new Map<string, PlaceResult>();
  const BATCH = 5; // 5 parallel requests for speed

  for (let i = 0; i < uniqueQueries.length; i += BATCH) {
    const batch = uniqueQueries.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (query) => {
        try {
          const res = await fetchWithTimeout("https://api.firecrawl.dev/v1/search", {
            timeout: 25_000,
            method: "POST",
            headers: {
              "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query,
              limit: 20,
            }),
          });

          if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            if (res.status === 429) {
              // Rate limited — pause briefly and continue
              console.warn(`Firecrawl rate limited, pausing...`);
              await new Promise(r => setTimeout(r, 2000));
            } else {
              console.warn(`Firecrawl search failed (${res.status}): ${errBody.slice(0, 200)}`);
            }
            return [];
          }

          const data = await res.json();
          if (!data.success || !Array.isArray(data.data)) return [];

          const places: PlaceResult[] = [];
          for (const item of data.data) {
            const place = parseFirecrawlResult(item, query);
            if (place) places.push(place);

            // Also extract emails from scraped markdown content
            if (item.markdown) {
              const emails = extractEmailsFromHtml(item.markdown);
              if (emails.length > 0 && place) {
                place.email = emails[0];
              }
            }
          }
          return places;
        } catch (e) {
          console.warn(`Firecrawl search error: ${e}`);
          return [];
        }
      })
    );

    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const place of r.value) {
        const domain = extractDomainFromWebsite(place.website);
        const key = domain || place.place_id;
        if (!unique.has(key)) unique.set(key, place);
      }
    }

    // Rate limit protection: brief pause between batches
    if (i + BATCH < uniqueQueries.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`Firecrawl complete: ${unique.size} unique businesses`);
  return Array.from(unique.values());
}

// ─── Apify Google Maps Fallback ─────────────────────────────

interface ApifyPlaceItem {
  title?: string;
  placeId?: string;
  address?: string;
  street?: string;
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
  categories?: string[];
  categoryName?: string;
  totalScore?: number;
  reviewsCount?: number;
  website?: string;
  email?: string;
  phone?: string;
  phoneUnformatted?: string;
  url?: string;
}

function mapApifyGooglePlace(item: ApifyPlaceItem): PlaceResult | null {
  if (!item?.title) return null;
  const phone = (item.phone || item.phoneUnformatted || "").replace(/\s+/g, "");
  return {
    place_id: item.placeId || `apify:${item.title}:${item.address || item.street || crypto.randomUUID()}`,
    name: item.title,
    formatted_address: item.address || item.street || "",
    business_status: item.permanentlyClosed ? "CLOSED_PERMANENTLY" : item.temporarilyClosed ? "CLOSED_TEMPORARILY" : "OPERATIONAL",
    types: Array.isArray(item.categories) && item.categories.length > 0
      ? item.categories.map((category: string) => category.toLowerCase().replace(/\s+/g, "_"))
      : item.categoryName
        ? [String(item.categoryName).toLowerCase().replace(/\s+/g, "_")]
        : [],
    rating: typeof item.totalScore === "number" ? item.totalScore : null,
    user_ratings_total: typeof item.reviewsCount === "number" ? item.reviewsCount : 0,
    website: item.website || null,
    email: item.email || null,
    phone: phone || null,
    url: item.url || null,
  };
}

async function searchPlacesViaApify(
  queryVariants: string[], country: string, city: string | undefined, maxResults = 250
): Promise<PlaceResult[]> {
  if (!APIFY_API_TOKEN) return [];
  const location = city ? `${city}, ${countryDisplayName(country)}` : countryDisplayName(country);
  const searchQueries = queryVariants.slice(0, 12).map((query) => `${query} in ${location}`);
  const perQuery = Math.min(Math.max(Math.ceil(maxResults / Math.max(searchQueries.length, 1)), 10), 100);
  try {
    const res = await fetchWithTimeout(
      `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`,
      {
        timeout: 20_000, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchStringsArray: searchQueries, maxCrawledPlacesPerSearch: perQuery,
          language: "en", deeperCityScrape: false, skipClosedPlaces: true,
        }),
      },
    );
    if (!res.ok) { console.warn(`Apify fallback failed: HTTP ${res.status}`); await res.text().catch(() => {}); return []; }
    const items = await res.json();
    if (!Array.isArray(items)) return [];
    const unique = new Map<string, PlaceResult>();
    for (const item of items) {
      const mapped = mapApifyGooglePlace(item);
      if (!mapped) continue;
      if (!unique.has(mapped.place_id)) unique.set(mapped.place_id, mapped);
    }
    console.log(`Apify fallback complete: ${unique.size} unique places`);
    return Array.from(unique.values());
  } catch (error) { console.warn("Apify fallback error:", error); return []; }
}

// ─── Google Places (tertiary fallback) ──────────────────────

function isFatalGooglePlacesStatus(status: string) {
  return ["REQUEST_DENIED", "OVER_DAILY_LIMIT", "OVER_QUERY_LIMIT", "INVALID_REQUEST"].includes(status);
}

async function searchViaGooglePlaces(
  queryVariants: string[], country: string, city: string | undefined, startTime: number
): Promise<PlaceResult[]> {
  if (!GOOGLE_PLACES_API_KEY) return [];
  const unique = new Map<string, PlaceResult>();
  const countryName = countryDisplayName(country);
  const searches: string[] = [];
  for (const variant of queryVariants) {
    if (city) searches.push(`${variant} in ${city}, ${countryName}`);
    searches.push(`${variant} in ${countryName}`);
    for (const majorCity of getMajorCities(country).slice(0, 6)) {
      if (majorCity.toLowerCase() !== (city || "").toLowerCase()) {
        searches.push(`${variant} in ${majorCity}, ${countryName}`);
      }
    }
  }
  const uniqueSearches = [...new Set(searches)];
  const BATCH = 25;
  for (let i = 0; i < uniqueSearches.length; i += BATCH) {
    if (timeLeftMs(startTime) < 30_000) break;
    const batch = uniqueSearches.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(async q => {
      const params = new URLSearchParams({ query: q, key: GOOGLE_PLACES_API_KEY });
      const res = await fetchWithTimeout(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`, { timeout: 4000 });
      if (!res.ok) { await res.text().catch(() => {}); return { results: [] as PlaceResult[], status: "HTTP_ERROR" }; }
      const data = await res.json();
      return { results: (data.results || []) as PlaceResult[], status: data.status || "UNKNOWN" };
    }));
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      if (isFatalGooglePlacesStatus(r.value.status)) return []; // Bail out
      for (const place of r.value.results) {
        if (place?.place_id && !unique.has(place.place_id)) unique.set(place.place_id, place);
      }
    }
  }
  return Array.from(unique.values());
}

function getPlaceDetails(place: PlaceResult): { website?: string; formatted_phone_number?: string; international_phone_number?: string; url?: string } {
  // For Firecrawl/Apify results, details are already included
  return {
    website: place.website || undefined,
    formatted_phone_number: place.phone || undefined,
    international_phone_number: place.phone || undefined,
    url: place.url || undefined,
  };
}

// ─── Discovery Phase (Firecrawl → Apify → Google) ───────────

async function discoverPlaces(
  queryVariants: string[], country: string, city: string | undefined, startTime: number
): Promise<PlaceResult[]> {
  // 1. Try Firecrawl first (primary)
  if (FIRECRAWL_API_KEY) {
    console.log("Discovery: trying Firecrawl Search (primary)...");
    const firecrawlResults = await searchViaFirecrawl(queryVariants, country, city);
    if (firecrawlResults.length > 0) {
      console.log(`Firecrawl returned ${firecrawlResults.length} results`);
      return firecrawlResults;
    }
    console.warn("Firecrawl returned no results, trying fallbacks...");
  }

  // 2. Try Apify (secondary)
  if (APIFY_API_TOKEN) {
    console.log("Discovery: trying Apify fallback...");
    const apifyResults = await searchPlacesViaApify(queryVariants, country, city);
    if (apifyResults.length > 0) return apifyResults;
    console.warn("Apify returned no results...");
  }

  // 3. Try Google Places (tertiary)
  if (GOOGLE_PLACES_API_KEY) {
    console.log("Discovery: trying Google Places fallback...");
    const googleResults = await searchViaGooglePlaces(queryVariants, country, city, startTime);
    if (googleResults.length > 0) return googleResults;
    console.warn("Google Places returned no results...");
  }

  throw new Error("Lead search failed: all data sources (Firecrawl, Apify, Google Maps) returned no results. Check your API keys and try a different search query.");
}

// ─── Reacher SMTP Verification ──────────────────────────────

async function reacherVerify(email: string, reacherUrl: string): Promise<"verified" | "invalid" | "unknown"> {
  try {
    const res = await fetchWithTimeout(`${reacherUrl}/v0/check_email`, {
      timeout: 6000,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_email: email }),
    });
    if (!res.ok) { await res.text().catch(() => {}); return "unknown"; }
    const data = await res.json();
    if (!data.syntax?.is_valid_syntax) return "invalid";
    if (data.misc?.is_disposable) return "invalid";
    if (data.is_reachable === "safe") return "verified";
    if (data.is_reachable === "invalid") return "invalid";
    // risky / unknown → keep as-is
    return "unknown";
  } catch { return "unknown"; }
}

// ─── Main Pipeline ──────────────────────────────────────────

async function runPipeline(
  sessionId: string, companyId: string, _userId: string,
  query: string, filters: Record<string, unknown>
) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startTime = Date.now();

  const updateProgress = async (progress: number, label: string) => {
    await supabase.from("lead_gen_sessions").update({
      progress, progress_label: label, updated_at: nowIso(),
    }).eq("id", sessionId);
  };

  try {
    const country = ((filters.country as string) || "dk").toLowerCase();
    const city = (filters.city as string) || extractCityFromQuery(query, country) || undefined;

    // ── Phase 1: AI Query Expansion ──
    await updateProgress(5, "AI analyserer søgning og udvider med relaterede brancher...");
    const cleanQuery = normalizeUserQuery(query);
    const queryVariants = await aiExpandQuery(cleanQuery);
    console.log(`AI expanded "${cleanQuery}" → ${queryVariants.length} variants`);

    // ── Phase 2: Load existing names for dedup ──
    await updateProgress(8, "Indlæser eksisterende data til deduplikering...");
    const existingNames = new Set<string>();
    const [prevNames, crmNames] = await Promise.all([
      (async () => {
        const names: string[] = [];
        let offset = 0;
        while (true) {
          const { data } = await supabase.from("lead_gen_results")
            .select("company_name").eq("company_id", companyId)
            .neq("session_id", sessionId).range(offset, offset + 999);
          if (!data || data.length === 0) break;
          for (const r of data) if (r.company_name) names.push(r.company_name.toLowerCase().trim());
          if (data.length < 1000) break;
          offset += 1000;
        }
        return names;
      })(),
      (async () => {
        const names: string[] = [];
        let offset = 0;
        while (true) {
          const { data } = await supabase.from("leads")
            .select("name, company_name").eq("company_id", companyId)
            .range(offset, offset + 999);
          if (!data || data.length === 0) break;
          for (const l of data) {
            if (l.company_name) names.push(l.company_name.toLowerCase().trim());
            if (l.name) names.push(l.name.toLowerCase().trim());
          }
          if (data.length < 1000) break;
          offset += 1000;
        }
        return names;
      })(),
    ]);
    for (const n of prevNames) existingNames.add(n);
    for (const n of crmNames) existingNames.add(n);
    console.log(`Dedup: ${existingNames.size} known names`);

    // ── Phase 3: Discover Places ──
    await updateProgress(12, `Søger virksomheder med ${queryVariants.length} varianter...`);
    let places = await discoverPlaces(queryVariants, country, city, startTime);

    // The discovery step deliberately also searches other major cities to
    // maximize coverage — but when the user asked for a specific city, those
    // results must not outrank actual matches. Stable-sort city matches first.
    if (city) {
      const cityLower = city.toLowerCase();
      places = [...places].sort((a, b) => {
        const aMatch = (a.formatted_address || "").toLowerCase().includes(cityLower) ? 0 : 1;
        const bMatch = (b.formatted_address || "").toLowerCase().includes(cityLower) ? 0 : 1;
        return aMatch - bMatch;
      });
    }

    if (places.length === 0) {
      await supabase.from("lead_gen_sessions").update({
        status: "done", progress: 100, progress_label: "Ingen resultater fundet",
        results_count: 0, completed_at: nowIso(), updated_at: nowIso(),
      }).eq("id", sessionId);
      return;
    }

    await updateProgress(20, `Fandt ${places.length} virksomheder — scraper websites og finder emails...`);
    console.log(`Starting enrichment of ${places.length} places`);

    // ── Phase 4: Enrich places inline (no self-invocation) ──
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalDedup = 0;
    const ENRICH_BATCH = 60; // Process 60 at a time for max throughput

    for (let i = 0; i < places.length; i += ENRICH_BATCH) {
      if (timeLeftMs(startTime) < 15_000) {
        console.log(`Time limit reached at ${i}/${places.length}`);
        break;
      }

      // Check if cancelled
      if (i % 100 === 0 && i > 0) {
        const { data: session } = await supabase
          .from("lead_gen_sessions").select("status").eq("id", sessionId).single();
        if (session?.status === "cancelled") break;
      }

      const batch = places.slice(i, i + ENRICH_BATCH);

      // Get place details in parallel
      const detailsBatch = await Promise.allSettled(batch.map(p => getPlaceDetails(p)));

      // Scrape websites in parallel (only for places with websites)
      const websites = detailsBatch.map((d, idx) => {
        if (d.status !== "fulfilled") return null;
        const url = d.value.website;
        if (url && !url.includes("google.com") && !url.includes("facebook.com")) return url;
        return null;
      });

      const scrapeResults = await Promise.allSettled(
        websites.map(url => url ? scrapeWebsite(url) : Promise.resolve(null))
      );

      const toInsert: Record<string, unknown>[] = [];

      for (let j = 0; j < batch.length; j++) {
        const place = batch[j];
        type PlaceDetails = ReturnType<typeof getPlaceDetails>;
        const details = detailsBatch[j]?.status === "fulfilled" ? (detailsBatch[j] as PromiseFulfilledResult<PlaceDetails>).value : ({} as PlaceDetails);
        const webData: ScrapedData = scrapeResults[j]?.status === "fulfilled" && (scrapeResults[j] as PromiseFulfilledResult<ScrapedData | null>).value
          ? (scrapeResults[j] as PromiseFulfilledResult<ScrapedData>).value
          : { emails: [], phones: [], description: null, contactPersons: [], linkedinUrls: [], companyLinkedin: null, technologies: [], sources: [] };

        const website = details.website || place.website || null;
        const websiteDomain = extractDomainFromWebsite(website);

        // Find best email
        const scrapedEmails = [...new Set([...(place.email ? [place.email] : []), ...webData.emails])].filter(e => isValidEmailFormat(e));
        const rankedEmails = rankEmails(scrapedEmails, websiteDomain);
        const candidateEmail = rankedEmails.length > 0 ? rankedEmails[0] : null;

        // Validate email
        const emailVerdict = candidateEmail ? await validateEmail(candidateEmail) : "missing";
        const hasUsableEmail = emailVerdict === "verified" || emailVerdict === "likely_valid" || emailVerdict === "catch_all";
        const hasPhone = !!(details.international_phone_number || details.formatted_phone_number || place.phone || webData.phones[0]);
        const hasWebsite = !!(details.website || place.website);
        
        // If must_have_email filter is set, email is REQUIRED — skip without valid email
        if (filters.must_have_email && !hasUsableEmail) {
          totalSkipped++;
          continue;
        }
        
        // If must_have_phone filter is set, phone is REQUIRED
        const phone = details.international_phone_number || details.formatted_phone_number || place.phone || webData.phones[0] || null;
        if (filters.must_have_phone && !phone) { totalSkipped++; continue; }
        if (filters.must_have_website && !hasWebsite) { totalSkipped++; continue; }
        
        // Without any filter, still skip leads with NOTHING useful
        if (!hasUsableEmail && !hasPhone && !hasWebsite) {
          totalSkipped++;
          continue;
        }

        const emailType = candidateEmail ? classifyEmailType(candidateEmail) : "missing";
        const addressParts = (place.formatted_address || "").split(",");
        const placeCity = addressParts.length >= 2 ? addressParts[addressParts.length - 2]?.trim() : null;
        const contactPerson = webData.contactPersons[0] || null;
        const sources = ["google_maps"];
        if (webData.sources.length > 0) sources.push(...webData.sources);
        const domain = websiteDomain;
        const domainHasMx = domain ? (mxCache.get(domain) !== false) : false;
        const domainHasSPF = domain ? (spfCache.get(domain) === true) : false;
        const emailConf = calculateEmailConfidence(emailVerdict, emailType, sources.length);
        const domainConf = domainHasMx ? (domainHasSPF ? 75 : 50) : 25;

        // Dedup check
        const cNameKey = (place.name || "").toLowerCase().trim();
        if (cNameKey && existingNames.has(cNameKey)) { totalDedup++; continue; }
        if (cNameKey) existingNames.add(cNameKey);

        const result: Record<string, unknown> = {
          session_id: sessionId,
          company_id: companyId,
          company_name: place.name || "Unknown",
          website,
          business_email: candidateEmail,
          email_status: emailVerdict,
          email_type: emailType,
          email_confidence: emailConf,
          domain_confidence: domainConf,
          phone,
          address: place.formatted_address || null,
          city: placeCity || city || null,
          country,
          industry: place.types?.[0]?.replace(/_/g, " ") || null,
          description: webData.description || null,
          source_url: details.url || place.url || `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
          source_registry: "google_maps",
          source_list: [...new Set(sources)],
          contact_person_name: contactPerson?.name || null,
          contact_role: contactPerson?.role || null,
          linkedin_url: webData.linkedinUrls[0] || null,
          company_linkedin: webData.companyLinkedin || null,
          google_maps_url: details.url || place.url || null,
          review_count: place.user_ratings_total || 0,
          rating: typeof place.rating === "number" ? place.rating : null,
          technologies_detected: webData.technologies.length > 0 ? webData.technologies : null,
          lead_score: 0,
          active_status: "uncertain",
        };

        result.lead_score = scoreLead(result);
        const quality = qualifyLead(result.lead_score as number);
        result.active_status = quality === "hot" ? "active_likely" : quality === "warm" ? "active_likely" : "uncertain";

        // Auto-reject very low quality leads
        const threshold = (filters.score_threshold as number) || AUTO_REJECT_THRESHOLD;
        if ((result.lead_score as number) < threshold) {
          totalSkipped++;
          continue;
        }

        toInsert.push(result);
      }

      // Insert batch to DB
      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase.from("lead_gen_results").insert(toInsert);
        if (insertErr) console.error("Insert error:", insertErr.message);
        else totalInserted += toInsert.length;
      }

      // Update progress with quality breakdown
      const pct = Math.min(85, 20 + Math.round((i / places.length) * 65));
      await updateProgress(pct, `Beriger & kvalificerer leads... ${totalInserted} godkendte (${totalSkipped} afvist, ${totalDedup} duplikater) — ${i + batch.length}/${places.length}`);
    }

    console.log(`Enrichment done: ${totalInserted} inserted, ${totalSkipped} skipped (no email), ${totalDedup} dedup`);

    // ── Phase 5: Reacher SMTP verification on inserted leads ──
    const reacherUrl = Deno.env.get("REACHER_API_URL");
    if (reacherUrl && totalInserted > 0 && timeLeftMs(startTime) > 10_000) {
      await updateProgress(87, "SMTP-verificerer emails med Reacher...");
      
      const { data: sessionResults } = await supabase
        .from("lead_gen_results").select("id, business_email")
        .eq("session_id", sessionId).not("business_email", "is", null).limit(1000);

      if (sessionResults && sessionResults.length > 0) {
        const SMTP_BATCH = 30;
        let deletedCount = 0;
        let verifiedCount = 0;

        for (let i = 0; i < sessionResults.length; i += SMTP_BATCH) {
          if (timeLeftMs(startTime) < 5_000) break;
          const batch = sessionResults.slice(i, i + SMTP_BATCH);

          const smtpResults = await Promise.allSettled(
            batch.map(async r => {
              const verdict = await reacherVerify(r.business_email!, reacherUrl);
              return { id: r.id, verdict };
            })
          );

          const toDelete: string[] = [];
          const toVerify: string[] = [];
          for (const sr of smtpResults) {
            if (sr.status !== "fulfilled") continue;
            if (sr.value.verdict === "invalid") toDelete.push(sr.value.id);
            else if (sr.value.verdict === "verified") toVerify.push(sr.value.id);
          }

          if (toDelete.length > 0) {
            await supabase.from("lead_gen_results").delete().in("id", toDelete);
            deletedCount += toDelete.length;
          }
          if (toVerify.length > 0) {
            for (const uid of toVerify) {
              await supabase.from("lead_gen_results").update({
                email_status: "verified", email_confidence: 95,
              }).eq("id", uid);
            }
            verifiedCount += toVerify.length;
          }

          await updateProgress(
            Math.min(97, 87 + Math.round((i / sessionResults.length) * 10)),
            `SMTP-verificerer emails... ${i + batch.length}/${sessionResults.length} (${deletedCount} ugyldige fjernet)`
          );
        }

        console.log(`Reacher: verified ${verifiedCount}, deleted ${deletedCount}`);
      }
    }

    // Delete any leads without email (safety net)
    await supabase.from("lead_gen_results").delete()
      .eq("session_id", sessionId).is("business_email", null);

    // ── Final counts with quality breakdown ──
    const [finalCountRes, verifiedRes, personRes, hotRes] = await Promise.all([
      supabase.from("lead_gen_results").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
      supabase.from("lead_gen_results").select("id", { count: "exact", head: true }).eq("session_id", sessionId).eq("email_status", "verified"),
      supabase.from("lead_gen_results").select("id", { count: "exact", head: true }).eq("session_id", sessionId).not("contact_person_name", "is", null),
      supabase.from("lead_gen_results").select("id", { count: "exact", head: true }).eq("session_id", sessionId).gte("lead_score", 60),
    ]);

    const total = finalCountRes.count || 0;
    const verified = verifiedRes.count || 0;
    const withPerson = personRes.count || 0;
    const hotLeads = hotRes.count || 0;

    let doneLabel: string;
    if (total === 0 && totalDedup > 0) {
      doneLabel = `Alle ${totalDedup} fundne virksomheder eksisterer allerede i din database.`;
    } else if (total === 0) {
      doneLabel = "Ingen leads med verificerede emails fundet. Prøv en bredere søgning.";
    } else {
      doneLabel = `${total} leads fundet — 🔥 ${hotLeads} hot leads, ✅ ${verified} verificerede, 👤 ${withPerson} med kontaktperson`;
    }

    await supabase.from("lead_gen_sessions").update({
      status: "done", progress: 100, progress_label: doneLabel,
      results_count: total, completed_at: nowIso(), updated_at: nowIso(),
    }).eq("id", sessionId);

    console.log(`Pipeline done: ${total} leads (${hotLeads} hot) in ${Math.round(elapsedMs(startTime) / 1000)}s`);
  } catch (e) {
    console.error("Pipeline error:", e);
    await supabase.from("lead_gen_sessions").update({
      status: "failed", error_message: e instanceof Error ? e.message : "Unknown error",
      updated_at: nowIso(),
    }).eq("id", sessionId);
  }
}

// ─── Route Handler ──────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[1] || "";
    const resourceId = pathParts[2] || "";
    const subAction = pathParts[3] || "";

    // ── POST /worker (fire-and-forget pipeline runner) ──
    if (req.method === "POST" && action === "worker") {
      const body = await req.json();
      const { sessionId, companyId, userId, query, filters } = body;
      if (!sessionId || !companyId) return errorResponse("Missing worker params", 400);
      await runPipeline(sessionId, companyId, userId, query, filters || {});
      return jsonResponse({ success: true });
    }

    // All other routes need auth
    const ctx = await getAuthContext(req);
    const { userId, companyId, supabase } = ctx;

    // ── POST /sessions ──
    if (req.method === "POST" && action === "sessions" && !resourceId) {
      // Check for running sessions
      const { data: running } = await supabase
        .from("lead_gen_sessions").select("id, created_at, status, results_count")
        .eq("company_id", companyId).in("status", ["pending", "running"]).limit(5);

      if (running && running.length > 0) {
        const now = Date.now();
        let blocked = false;
        for (const s of running) {
          const age = now - new Date(s.created_at).getTime();
          if (age > STUCK_SESSION_THRESHOLD_MS) {
            await supabase.from("lead_gen_sessions").update({
              status: "done", progress: 100,
              progress_label: `Fandt ${s.results_count || 0} leads (auto-fuldført)`,
              completed_at: nowIso(), updated_at: nowIso(),
            }).eq("id", s.id);
          } else blocked = true;
        }
        if (blocked) return errorResponse("A session is already running", 409);
      }

      const body = await req.json();
      const { query, filters } = body;
      if (!query) return errorResponse("Missing query");

      const { data: session, error } = await supabase
        .from("lead_gen_sessions")
        .insert({ company_id: companyId, user_id: userId, query, filters: filters || {}, status: "running" })
        .select().single();
      if (error) return errorResponse(error.message, 500);

      // Fire-and-forget worker
      const workerUrl = `${SUPABASE_URL}/functions/v1/lead-gen-api/worker`;
      fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ sessionId: session.id, companyId, userId, query, filters: filters || {} }),
      }).catch(e => console.error("Failed to invoke worker:", e));

      return jsonResponse({ data: { session } });
    }

    // ── GET /sessions ──
    if (req.method === "GET" && action === "sessions" && !resourceId) {
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
      const offset = (page - 1) * limit;
      const { data, error } = await supabase.from("lead_gen_sessions").select("*")
        .eq("company_id", companyId).order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data: { sessions: data } });
    }

    // ── GET /sessions/:id ──
    if (req.method === "GET" && action === "sessions" && resourceId && !subAction) {
      const { data: session } = await supabase.from("lead_gen_sessions").select("*")
        .eq("id", resourceId).eq("company_id", companyId).single();
      if (!session) return errorResponse("Session not found", 404);

      // Auto-complete stuck sessions
      if ((session.status === "running" || session.status === "pending")) {
        const age = Date.now() - new Date(session.created_at).getTime();
        if (age > STUCK_SESSION_THRESHOLD_MS) {
          session.status = "done";
          session.progress = 100;
          session.progress_label = `Fandt ${session.results_count || 0} leads (auto-fuldført)`;
          session.completed_at = nowIso();
          await supabase.from("lead_gen_sessions").update({
            status: "done", progress: 100,
            progress_label: session.progress_label,
            completed_at: session.completed_at, updated_at: nowIso(),
          }).eq("id", resourceId);
        }
      }

      const { data: results } = await supabase.from("lead_gen_results").select("*")
        .eq("session_id", resourceId).order("lead_score", { ascending: false }).limit(2000);
      return jsonResponse({ data: { session, results: results || [] } });
    }

    // ── POST /sessions/:id/cancel ──
    if (req.method === "POST" && action === "sessions" && resourceId && subAction === "cancel") {
      await supabase.from("lead_gen_sessions").update({
        status: "cancelled", updated_at: nowIso(),
      }).eq("id", resourceId).eq("company_id", companyId);
      return jsonResponse({ success: true });
    }

    // ── DELETE /sessions/:id ──
    if (req.method === "DELETE" && action === "sessions" && resourceId) {
      await supabase.from("lead_gen_results").delete().eq("session_id", resourceId);
      await supabase.from("lead_gen_sessions").delete()
        .eq("id", resourceId).eq("company_id", companyId);
      return jsonResponse({ success: true });
    }

    // ── POST /sessions/:id/import ──
    if (req.method === "POST" && action === "sessions" && resourceId && subAction === "import") {
      const { result_ids, folder_id } = await req.json();
      if (!Array.isArray(result_ids) || result_ids.length === 0) return errorResponse("Missing result_ids");

      interface LeadGenResultRow {
        id: string;
        contact_person_name?: string | null;
        company_name?: string | null;
        business_email?: string | null;
        phone?: string | null;
        industry?: string | null;
        website?: string | null;
        address?: string | null;
        contact_role?: string | null;
        linkedin_url?: string | null;
        company_linkedin?: string | null;
        description?: string | null;
        review_count?: number | null;
        rating?: number | null;
        technologies_detected?: string[] | null;
        lead_score?: number | null;
      }

      const allResults: LeadGenResultRow[] = [];
      for (let i = 0; i < result_ids.length; i += 50) {
        const batch = result_ids.slice(i, i + 50);
        const { data } = await supabase.from("lead_gen_results").select("*")
          .eq("session_id", resourceId).eq("company_id", companyId)
          .in("id", batch).eq("imported", false);
        if (data) allResults.push(...data);
      }
      if (allResults.length === 0) return errorResponse("No importable results found");

      const leads = allResults.map((r) => ({
        company_id: companyId,
        created_by: userId,
        name: r.contact_person_name || r.company_name || "Unknown Lead",
        email: r.business_email || `noemail-${r.id.slice(0, 8)}@placeholder.local`,
        phone: r.phone || null,
        company_name: r.company_name,
        industry: r.industry || null,
        notes: [
          r.website ? `Website: ${r.website}` : null,
          r.address ? `Adresse: ${r.address}` : null,
          r.contact_person_name ? `Kontakt: ${r.contact_person_name} (${r.contact_role || "N/A"})` : null,
          r.linkedin_url ? `LinkedIn: ${r.linkedin_url}` : null,
          r.company_linkedin ? `Company LinkedIn: ${r.company_linkedin}` : null,
          r.description ? `Beskrivelse: ${r.description}` : null,
          r.review_count ? `Google Reviews: ${r.review_count} (${r.rating || "N/A"} ⭐)` : null,
          r.technologies_detected?.length ? `Teknologier: ${r.technologies_detected.join(", ")}` : null,
        ].filter(Boolean).join("\n"),
        status: "new",
        score: r.lead_score || 0,
        tags: ["lead-gen", ...(r.contact_person_name ? ["has-contact"] : [])],
        ...(folder_id ? { folder_id } : {}),
      }));

      const allInserted: { id: string }[] = [];
      for (let i = 0; i < leads.length; i += 50) {
        const batch = leads.slice(i, i + 50);
        const { data: inserted, error: insertErr } = await supabase.from("leads").insert(batch).select("id");
        if (insertErr) { console.error("Import insert error:", insertErr); continue; }
        if (inserted) allInserted.push(...inserted);
      }

      // Mark as imported
      for (let i = 0; i < allResults.length; i++) {
        const leadId = allInserted[i]?.id || null;
        await supabase.from("lead_gen_results").update({
          imported: true, imported_lead_id: leadId,
        }).eq("id", allResults[i].id);
      }

      return jsonResponse({ imported_count: allInserted.length });
    }

    // ── Saved Searches ──
    if (req.method === "GET" && action === "saved") {
      const { data } = await supabase.from("lead_gen_saved_searches").select("*")
        .eq("company_id", companyId).order("created_at", { ascending: false });
      return jsonResponse({ data: { searches: data || [] } });
    }

    if (req.method === "POST" && action === "saved") {
      const body = await req.json();
      const { name, query: q, filters: f } = body;
      if (!name || !q) return errorResponse("Missing name or query");
      const { data, error } = await supabase.from("lead_gen_saved_searches")
        .insert({ company_id: companyId, user_id: userId, name, query: q, filters: f || {} })
        .select().single();
      if (error) return errorResponse(error.message, 500);
      return jsonResponse(data);
    }

    if (req.method === "DELETE" && action === "saved" && resourceId) {
      await supabase.from("lead_gen_saved_searches").delete()
        .eq("id", resourceId).eq("company_id", companyId);
      return jsonResponse({ success: true });
    }

    return errorResponse("Not found", 404);
  } catch (e) {
    console.error("Handler error:", e);
    const msg = e instanceof Error ? e.message : "Internal error";
    if (msg === "Unauthorized") return errorResponse(msg, 401);
    return errorResponse(msg, 500);
  }
});
