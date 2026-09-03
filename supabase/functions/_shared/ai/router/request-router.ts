import { z } from "npm:zod@3.23.8";
import { detectLanguage } from "./language.ts";
import { OllamaClient } from "../model/ollama.client.ts";
import type { SupportedLanguage } from "../model/model.types.ts";

export const DOMAINS = [
  "conversation", "crm", "email", "calendar", "marketing", "files", "finance",
  "payments", "hr", "tasks", "communication", "reporting", "automation",
  "integrations", "settings", "unknown",
] as const;
export type Domain = typeof DOMAINS[number];

export type ActionType = "answer" | "read" | "execute" | "multi_step";

export interface RouteResult {
  language: SupportedLanguage;
  domain: Domain;
  actionType: ActionType;
  confidence: number;
  deterministic: boolean;
}

// Keyword rules, cheapest first. Each rule: domain, actionType, and
// da/en/de trigger patterns. Order matters — more specific domains before
// generic ones (e.g. "opret opgave" before a bare CRM "opret").
const RULES: { domain: Domain; actionType: ActionType; patterns: RegExp[] }[] = [
  { domain: "email", actionType: "execute", patterns: [/\b(send|skriv)\b.*\b(mail|email)\b/i, /\bsend\b.*\bemail\b/i, /\be-?mail\b.*\bsend/i, /\bschick\b.*\be-?mail\b/i] },
  { domain: "email", actionType: "read", patterns: [/\b(vis|find|søg|check)\b.*\bmails?\b/i, /\b(show|find|search)\b.*\bemails?\b/i, /\b(zeig|finde)\b.*\be-?mails?\b/i, /\bungelesen(e|en)?\b.*\be-?mails?\b/i, /\bunread\b.*\bemails?\b/i, /\bulæste?\b.*\bmails?\b/i] },
  { domain: "calendar", actionType: "execute", patterns: [/\bbook\b.*\bm[øo]de\b/i, /\bopret\b.*\b(møde|aftale|kalender)/i, /\bschedule\b.*\bmeeting\b/i, /\bbook\b.*\bmeeting\b/i, /\btermin\b.*\b(vereinbaren|erstellen)\b/i, /\bvereinbar(e|en)\b.*\btermin\b/i] },
  { domain: "calendar", actionType: "read", patterns: [/\b(vis|find)\b.*\b(møder|kalender|aftaler)\b/i, /\b(show|find)\b.*\b(meetings|calendar)\b/i, /\bzeig\b.*\btermine\b/i] },
  { domain: "tasks", actionType: "execute", patterns: [/\bopret\b.*\bopgave/i, /\b(create|schedule|add)\b.*\btask/i, /\berstelle\b.*\baufgabe/i, /\b(afslut|fuldfør)\b.*\bopgave/i] },
  { domain: "tasks", actionType: "read", patterns: [/\b(vis|mine)\b.*\bopgaver\b/i, /\b(show|my)\b.*\btasks\b/i, /\bmeine\b.*\baufgaben\b/i] },
  { domain: "crm", actionType: "read", patterns: [/\b(vis|find|mine)\b.*\bleads?\b/i, /\b(show|find|my)\b.*\bleads?\b/i, /\bmeine\b.*\bleads?\b/i, /\bkontakt(er)?\b/i, /\bdeals?\b/i, /\bkunder?\b/i] },
  { domain: "crm", actionType: "execute", patterns: [/\bopret\b.*\b(lead|kunde|deal)\b/i, /\bcreate\b.*\b(lead|customer|deal)\b/i, /\berstelle\b.*\b(lead|kunde|deal)\b/i] },
  { domain: "marketing", actionType: "read", patterns: [/\b(vis|mine)\b.*\bkampagner?\b/i, /\b(show|my)\b.*\bcampaigns?\b/i, /\bfacebook.?annonce\b/i, /\b(annonce|reklame)\b/i, /\bad campaign\b/i, /\banzeige(n)?\b/i] },
  { domain: "marketing", actionType: "execute", patterns: [/\blav\b.*\b(annonce|kampagne)\b/i, /\bcreate\b.*\b(ad|campaign)\b/i, /\berstelle\b.*\b(anzeige|kampagne)\b/i] },
  { domain: "files", actionType: "read", patterns: [/\b(fil|dokument)er?\b/i, /\bfiles?\b/i, /\bdokumente?\b/i] },
  { domain: "finance", actionType: "read", patterns: [/\bfaktura(er)?\b/i, /\binvoices?\b/i, /\brechnung(en)?\b/i, /\btilbud\b/i, /\bquotes?\b/i] },
  { domain: "payments", actionType: "read", patterns: [/\bbetaling(er)?\b/i, /\bpayments?\b/i, /\bzahlung(en)?\b/i] },
  { domain: "hr", actionType: "read", patterns: [/\bmedarbejder(e)?\b/i, /\bemployees?\b/i, /\bmitarbeiter\b/i, /\bferie\b|\borlov\b/i, /\bkolleg(a|er|erne)?\b/i, /\bcolleagues?\b/i, /\bkolleg(e|en|innen)?\b/i] },
  { domain: "reporting", actionType: "read", patterns: [/\brapport(er)?\b/i, /\breports?\b/i, /\bbericht(e)?\b/i, /\bdashboard\b/i] },
  { domain: "integrations", actionType: "read", patterns: [/\bintegration(er|s|en)?\b/i, /\bforbindelse(r)?\b/i, /\bconnections?\b/i, /\bverbindung(en)?\b/i, /\bverbunden(e|en)?\b/i, /\bconnected\b/i, /\bforbundne?\b/i] },
  { domain: "settings", actionType: "read", patterns: [/\bindstillinger\b/i, /\bsettings\b/i, /\beinstellungen\b/i] },
];

export class RequestRouter {
  /** Fast path: no LLM call. Returns null if nothing matched confidently. */
  private static deterministic(message: string, language: SupportedLanguage): RouteResult | null {
    for (const rule of RULES) {
      if (rule.patterns.some((p) => p.test(message))) {
        return { language, domain: rule.domain, actionType: rule.actionType, confidence: 0.9, deterministic: true };
      }
    }
    return null;
  }

  static async route(message: string): Promise<RouteResult> {
    const language = detectLanguage(message);
    const fast = this.deterministic(message, language);
    if (fast) return fast;

    // Ambiguous — one small structured generation, never a full plan.
    const schema = z.object({
      domain: z.enum(DOMAINS),
      actionType: z.enum(["answer", "read", "execute", "multi_step"]),
      confidence: z.number().min(0).max(1),
    });
    const result = await OllamaClient.structured(
      [
        { role: "system", content: `Classify the user's message into exactly one domain from: ${DOMAINS.join(", ")}. Also give actionType (answer/read/execute/multi_step) and a confidence 0-1. Return ONLY JSON: {"domain":string,"actionType":string,"confidence":number}.` },
        { role: "user", content: message },
      ],
      schema,
      { timeoutMs: 15000 },
    );
    if (result.ok && result.data) {
      return { language, domain: result.data.domain, actionType: result.data.actionType, confidence: result.data.confidence, deterministic: false };
    }
    return { language, domain: "conversation", actionType: "answer", confidence: 0.3, deterministic: false };
  }
}
