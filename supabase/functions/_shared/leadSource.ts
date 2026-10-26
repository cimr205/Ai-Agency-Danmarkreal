// Shared contract for lead-gen company sources (Maps/OSM/SearXNG/CVR/Krak/Apify-fallback) and
// enrichment steps. Every source adapter normalizes into this shape before dedupe/merge/scoring.
// See DECISIONS.md sections 2, 4, 6 for the sources this backs and why.

export interface RawLead {
  name: string;
  cvr?: string;
  address?: string;
  city?: string;
  postnr?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  phone_type?: "mobile" | "landline" | "unknown";
  email_generic?: string;
  email_personal?: string;
  website?: string;
  branchekode?: string;
  industry_text?: string;
  employee_range?: string;
  status?: string;
  rating?: number | null;
  review_count?: number;
  google_maps_url?: string;
  source: LeadSourceName;
  sources: LeadSourceName[];
  source_details: Partial<Record<FieldName, LeadSourceName>>;
  fetched_at: string;
}

export type LeadSourceName = "GoogleMaps" | "Gosom" | "OSM" | "SearXNG" | "Krak" | "CVR" | "Website" | "Apify";
export type FieldName = "phone" | "email" | "address" | "website" | "owner";

export interface OwnerValidation {
  owner_name: string | null;
  owner_role: string | null;
  owner_confidence: number; // 0-100. Below OWNER_CONFIDENCE_DISPLAY_THRESHOLD, UI shows "ikke valideret".
  owner_sources: string[]; // e.g. ["CVR:virksomhedsform", "Website:/kontakt"]
  linkedin_search_url: string | null; // generated, never scraped
}

export const OWNER_CONFIDENCE_DISPLAY_THRESHOLD = 50;

export interface ComplianceFlags {
  reklamebeskyttet: boolean | null; // null = unknown; NEVER treat as "safe to contact"
  samtykke_status: "ukendt" | "givet" | "nej";
  cvr_status: string | null; // aktiv/ophørt/tvangsopløst, from CVR if available
}

// A LeadSource adapter fetches raw companies for a query; it does not enrich or score.
export interface LeadSource {
  name: LeadSourceName;
  search(params: {
    queries: string[];
    location: string;
    maxResults: number;
    signal?: AbortSignal;
  }, onProgress?: (message: string, count: number) => void): Promise<RawLead[]>;
}

// Confirmation-gated SSE events emitted by the chat backend (see DECISIONS.md section 6).
export type ConfirmNeededEvent =
  | { kind: "radius_expand"; current_count: number; requested: number; suggested_radius_km: number; suggested_cities: string[] }
  | { kind: "save_confirm"; session_id: string; count: number };
