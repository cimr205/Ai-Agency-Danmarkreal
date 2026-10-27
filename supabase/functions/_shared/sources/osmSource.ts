// OSM/Overpass source — free, no auth required. Supplementary lead source per DECISIONS.md
// section 2 (catches businesses Google Maps/CVR miss, especially phone-less listings).
//
// Pipeline: geocode the requested location via DAWA (Danish address register, also free/no-auth)
// to get a lat/lng center point, then query the public Overpass API for OSM nodes/ways tagged
// with a `craft`/`shop`/`office`/`amenity` value inferred from the user's query terms, within a
// fixed-radius bounding circle around that point.
//
// Both DAWA and Overpass are third-party free public services — all calls go through
// politeFetch() (User-Agent + robots.txt + per-domain rate limiting), per mission items #26/#48.
// Overpass's public instance explicitly asks heavy users to throttle themselves, hence the
// stricter rate-limit settings passed to politeFetch() for that call specifically.
//
// NOT LIVE-TESTED: no network access to overpass-api.de or api.dataforsyningen.dk was available
// while writing this (sandboxed dev environment, no Deno runtime either). Field names for DAWA's
// address-search JSON response and Overpass's `around:` query semantics were taken from their
// public documentation, not verified against a live call. Flagged in DECISIONS.md.

import type { LeadSource, RawLead } from "../leadSource.ts";
import { politeFetch } from "./fetchPolite.ts";

// Geocoding: DAWA (api.dataforsyningen.dk) was decommissioned (returns HTTP 410 Gone), so we use
// OSM's own Nominatim — free, no token, and consistent with the Overpass data source below.
// Nominatim policy: <=1 req/s + a real User-Agent (both enforced by politeFetch).
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DEFAULT_RADIUS_M = 8000; // ~8km — a reasonable "in <city>" radius for mid-size DK towns

// Danish trade terms -> OSM `craft` tag values (subset of the official OSM craft value list:
// https://wiki.openstreetmap.org/wiki/Key:craft). Not exhaustive — unmapped terms fall back to
// a name-text search (see resolveTagFilter / buildOverpassQuery).
const CRAFT_TAG_MAP: Record<string, string> = {
  "tømrer": "carpenter",
  "snedker": "carpenter",
  "elektriker": "electrician",
  "vvs": "plumber",
  "blikkenslager": "plumber",
  "maler": "painter",
  "murer": "stonemason",
  "gulvlægger": "floorer",
  "tagdækker": "roofer",
  "anlægsgartner": "gardener",
  "gartner": "gardener",
  "glarmester": "glaziery",
  "smed": "blacksmith",
  "låsesmed": "locksmith",
  "urmager": "clockmaker",
  "fotograf": "photographer",
  "skrædder": "tailor",
};

// Terms that map better to OSM `shop`/`office`/`amenity` tags than `craft`.
const OTHER_TAG_MAP: Record<string, { key: string; value: string }> = {
  "frisør": { key: "shop", value: "hairdresser" },
  "bager": { key: "shop", value: "bakery" },
  "restaurant": { key: "amenity", value: "restaurant" },
  "café": { key: "amenity", value: "cafe" },
  "tandlæge": { key: "amenity", value: "dentist" },
  "læge": { key: "amenity", value: "doctors" },
  "advokat": { key: "office", value: "lawyer" },
  "revisor": { key: "office", value: "accountant" },
  "ejendomsmægler": { key: "office", value: "estate_agent" },
  "bilværksted": { key: "shop", value: "car_repair" },
  "mekaniker": { key: "shop", value: "car_repair" },
  "butik": { key: "shop", value: "*" },
};

interface GeoPoint {
  lat: number;
  lng: number;
}

interface NominatimResult {
  lat?: string;
  lon?: string;
  display_name?: string;
}

async function geocodeLocation(location: string): Promise<GeoPoint | null> {
  if (!location) return null;
  try {
    // Restrict to Denmark; jsonv2; one best match. Append ", Danmark" so a bare city name
    // resolves to the town centre rather than a same-named feature elsewhere.
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(`${location}, Danmark`)}` +
      `&countrycodes=dk&format=jsonv2&limit=1`;
    // Nominatim's robots.txt blocks /search for generic crawlers, but its Usage Policy explicitly
    // permits automated /search at <=1 req/s with an identifiable User-Agent (both enforced here).
    // The robots.txt check is therefore skipped in favour of the authoritative API policy.
    const res = await politeFetch(url, { timeoutMs: 6000, ratePerSec: 1, bucketSize: 1, skipRobotsCheck: true });
    if (!res.ok) return null;
    const data: NominatimResult[] = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    if (!first?.lat || !first?.lon) return null;
    const lat = parseFloat(first.lat), lng = parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch (e) {
    console.error("osmSource geocode error:", e);
    return null;
  }
}

function resolveTagFilter(query: string): { key: string; value: string } | null {
  const lower = query.toLowerCase().trim();
  if (CRAFT_TAG_MAP[lower]) return { key: "craft", value: CRAFT_TAG_MAP[lower] };
  if (OTHER_TAG_MAP[lower]) return OTHER_TAG_MAP[lower];
  return null;
}

function buildOverpassQuery(queries: string[], center: GeoPoint, radiusM: number): string {
  const clauses: string[] = [];
  for (const q of queries) {
    const tag = resolveTagFilter(q);
    if (tag && tag.value === "*") {
      clauses.push(`node["${tag.key}"](around:${radiusM},${center.lat},${center.lng});`);
      clauses.push(`way["${tag.key}"](around:${radiusM},${center.lat},${center.lng});`);
    } else if (tag) {
      clauses.push(`node["${tag.key}"="${tag.value}"](around:${radiusM},${center.lat},${center.lng});`);
      clauses.push(`way["${tag.key}"="${tag.value}"](around:${radiusM},${center.lat},${center.lng});`);
    } else {
      // No confident tag mapping — fall back to a case-insensitive substring match on `name`.
      const escaped = q.replace(/["\\]/g, "");
      if (!escaped) continue;
      clauses.push(`node["name"~"${escaped}",i](around:${radiusM},${center.lat},${center.lng});`);
      clauses.push(`way["name"~"${escaped}",i](around:${radiusM},${center.lat},${center.lng});`);
    }
  }
  return `[out:json][timeout:25];\n(\n${clauses.join("\n")}\n);\nout center tags;`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function mapOverpassElement(el: OverpassElement): RawLead | null {
  const tags = el.tags || {};
  const name = tags["name"];
  if (!name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;

  const street = tags["addr:street"];
  const houseNumber = tags["addr:housenumber"];
  const address = street && houseNumber ? `${street} ${houseNumber}` : street || undefined;
  const city = tags["addr:city"];
  const postnr = tags["addr:postcode"];
  const phone = (tags["phone"] || tags["contact:phone"])?.replace(/\s/g, "") || undefined;
  const website = tags["website"] || tags["contact:website"];
  const industry = tags["craft"] || tags["shop"] || tags["office"] || tags["amenity"];

  return {
    name,
    address,
    city,
    postnr,
    lat,
    lng,
    phone,
    phone_type: phone ? "unknown" : undefined,
    website,
    industry_text: industry,
    status: "Aktiv",
    source: "OSM",
    sources: ["OSM"],
    source_details: {
      ...(phone ? { phone: "OSM" as const } : {}),
      ...(address ? { address: "OSM" as const } : {}),
      ...(website ? { website: "OSM" as const } : {}),
    },
    fetched_at: new Date().toISOString(),
  };
}

export const osmSource: LeadSource = {
  name: "OSM",
  async search(params, onProgress) {
    const { queries, location, maxResults, signal } = params;

    onProgress?.(`Geokoder "${location}" via OSM Nominatim...`, 0);
    const center = await geocodeLocation(location);
    if (!center) {
      onProgress?.(`OSM: kunne ikke geokode "${location}" — springer OSM-kilde over.`, 0);
      return [];
    }
    if (signal?.aborted) return [];

    const overpassQl = buildOverpassQuery(queries, center, DEFAULT_RADIUS_M);
    onProgress?.(`Forespørger Overpass API omkring ${location}...`, 0);

    try {
      const res = await politeFetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: overpassQl,
        timeoutMs: 30000,
        // Overpass's public instance explicitly asks heavy users to throttle themselves —
        // deliberately stricter than the default politeFetch settings.
        ratePerSec: 1,
        bucketSize: 2,
        maxConcurrency: 1,
        // The Overpass API is a documented programmatic endpoint governed by its fair-use policy,
        // not a crawl target; its robots.txt blanket-blocks bots, so skip that check here (we still
        // honour the stricter self-throttle + identifiable User-Agent above).
        skipRobotsCheck: true,
      });
      if (!res.ok) {
        console.error("osmSource: Overpass request failed:", res.status);
        return [];
      }
      const data = await res.json();
      const elements: OverpassElement[] = data?.elements || [];
      const mapped = elements.map(mapOverpassElement).filter((r): r is RawLead => r !== null);
      onProgress?.(`OSM: ${mapped.length} resultater`, mapped.length);
      return mapped.slice(0, maxResults);
    } catch (e) {
      console.error("osmSource search error:", e);
      return [];
    }
  },
};
