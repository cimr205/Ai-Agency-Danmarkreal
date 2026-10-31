import { detectLanguage } from "./language.ts";
import type { SupportedLanguage } from "../model/model.types.ts";

export interface FastIntentMatch {
  matched: true;
  language: SupportedLanguage;
  capability: string;
  confidence: number;
  parameters: Record<string, unknown>;
}
export interface FastIntentNoMatch {
  matched: false;
}
export type FastIntentResult = FastIntentMatch | FastIntentNoMatch;

// §7/§9: the single most important part of the spec — Groq (or any LLM)
// must NEVER be called for these. Only covers unambiguous, no-parameter
// "show me X" requests; anything with real parameters or multiple steps
// falls through to the planner on purpose. High confidence (0.95) is
// deliberate — this bypasses planning/validation-by-LLM entirely, so it
// must only fire on genuinely unambiguous phrasing.
const FAST_INTENTS: { capability: string; confidence: number; patterns: RegExp[] }[] = [
  { capability: "crm.leads.search", confidence: 0.95, patterns: [/^(vis|find)\s+(mine\s+)?leads?\.?$/i, /^(show|find)\s+(my\s+)?leads?\.?$/i, /^zeig\s+mir\s+meine\s+leads?\.?$/i] },
  { capability: "crm.contacts.search", confidence: 0.95, patterns: [/^vis\s+(mine\s+)?kontakter\.?$/i, /^show\s+(my\s+)?contacts\.?$/i, /^zeig\s+mir\s+meine\s+kontakte\.?$/i] },
  { capability: "crm.deals.search", confidence: 0.95, patterns: [/^vis\s+(mine\s+)?deals\.?$/i, /^show\s+(my\s+)?deals\.?$/i, /^zeig\s+mir\s+meine\s+deals\.?$/i] },
  { capability: "tasks.search", confidence: 0.95, patterns: [/^vis\s+(mine\s+)?opgaver\.?$/i, /^show\s+(my\s+)?tasks\.?$/i, /^zeig\s+mir\s+meine\s+aufgaben\.?$/i] },
  { capability: "calendar.search_events", confidence: 0.95, patterns: [/^vis\s+(min\s+)?kalender\.?$/i, /^show\s+(my\s+)?calendar\.?$/i, /^zeig\s+mir\s+(meinen\s+)?kalender\.?$/i] },
  { capability: "email.search", confidence: 0.95, patterns: [/^vis\s+(mine\s+)?mails?\.?$/i, /^show\s+(my\s+)?emails?\.?$/i, /^zeig\s+mir\s+meine\s+e-?mails?\.?$/i] },
  { capability: "integrations.list", confidence: 0.95, patterns: [/^vis\s+(mine\s+)?integrationer\.?$/i, /^show\s+(my\s+)?integrations\.?$/i, /^zeig\s+mir\s+meine\s+integrationen\.?$/i] },
  { capability: "files.search", confidence: 0.9, patterns: [/^vis\s+(mine\s+)?(fil|dokument)er\.?$/i, /^show\s+(my\s+)?(files|documents)\.?$/i, /^zeig\s+mir\s+meine\s+dokumente\.?$/i] },
  { capability: "invoices.search", confidence: 0.95, patterns: [/^vis\s+(mine\s+)?fakturaer\.?$/i, /^show\s+(my\s+)?invoices\.?$/i, /^zeig\s+mir\s+meine\s+rechnungen\.?$/i] },
  { capability: "hr.employees.search", confidence: 0.9, patterns: [/^vis\s+(mine\s+)?medarbejdere\.?$/i, /^show\s+(my\s+)?employees\.?$/i, /^zeig\s+mir\s+meine\s+mitarbeiter\.?$/i] },
  { capability: "reporting.dashboard.read", confidence: 0.95, patterns: [/^vis\s+(mit\s+)?dashboard\.?$/i, /^show\s+(my\s+)?dashboard\.?$/i, /^zeig\s+mir\s+(mein\s+)?dashboard\.?$/i] },
];

const CONFIDENCE_THRESHOLD = 0.9;

export function matchFastIntent(message: string): FastIntentResult {
  const trimmed = message.trim();
  const language = detectLanguage(trimmed);
  for (const intent of FAST_INTENTS) {
    if (intent.patterns.some((p) => p.test(trimmed)) && intent.confidence >= CONFIDENCE_THRESHOLD) {
      return { matched: true, language, capability: intent.capability, confidence: intent.confidence, parameters: {} };
    }
  }
  return { matched: false };
}
