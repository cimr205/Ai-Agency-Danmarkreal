// ── Lead (final output stored + returned to CRM) ─────────────────────────────

export type ValidationStatus = 'valid' | 'risky' | 'invalid' | 'unknown';
export type EmailPriority    = 'high' | 'medium' | 'low';
export type SessionStatus    = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
export type EmailStatus      = 'verified' | 'likely_valid' | 'unverified' | 'missing';
export type ActiveStatus     = 'active_likely' | 'uncertain' | 'inactive_likely';

export interface DiscoveredCompany {
  company_name : string;
  website      : string;
  phone        : string;
  address      : string;
  rating       : string;
}

export interface ExtractedEmail {
  email       : string;
  source_page : string;
  priority    : EmailPriority;  // high = founder/ceo/owner, medium = sales/hello, low = info/support
}

export interface ValidatedEmail extends ExtractedEmail {
  validation_status : ValidationStatus;  // valid | risky | invalid | unknown
  mx_valid          : boolean;
}

export interface Lead {
  id                : string;
  session_id        : string;
  company_name      : string;
  website           : string;
  domain            : string;
  email             : string;            // best email found
  email_status      : EmailStatus;
  validation_status : ValidationStatus;
  source_page       : string;
  phone             : string;
  address           : string;
  city              : string;
  country           : string;
  niche             : string;
  lead_score        : number;            // 0-100
  active_status     : ActiveStatus;
  imported          : boolean;
  imported_lead_id  : string;
  scraped_at        : string;
}

// ── Session ───────────────────────────────────────────────────────────────────

export interface SessionFilters {
  country          : string;
  city             : string;
  niche            : string;
  must_have_email  : boolean;
  must_have_phone  : boolean;
  must_have_website: boolean;
  score_threshold  : number;
  min_leads        : number;
  exclude_keywords : string;
}

export interface Session {
  id             : string;
  company_id     : string;
  user_id        : string;
  query          : string;
  filters        : SessionFilters;
  status         : SessionStatus;
  progress       : number;
  progress_label : string;
  results_count  : number;
  error_message  : string;
  started_at     : string;
  completed_at   : string;
  created_at     : string;
  updated_at     : string;
}

// ── Saved search ──────────────────────────────────────────────────────────────

export interface SavedSearch {
  id         : string;
  company_id : string;
  name       : string;
  query      : string;
  filters    : Partial<SessionFilters>;
  created_at : string;
}
