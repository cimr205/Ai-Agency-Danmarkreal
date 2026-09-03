import { OllamaClient } from "../model/ollama.client.ts";
import { responsePrompt } from "../prompts/response.ts";
import type { StepExecutionRecord } from "../execution/execution-engine.ts";
import type { SupportedLanguage } from "../model/model.types.ts";

const TEMPLATES: Record<SupportedLanguage, Record<string, (r: StepExecutionRecord) => string>> = {
  da: {
    "email.send": () => "Mailen er sendt.",
    "tasks.create": (r) => `Opgaven "${(r.output as { title?: string })?.title ?? ""}" er oprettet.`,
    "calendar.create_event": (r) => `Mødet "${(r.output as { title?: string })?.title ?? ""}" er booket.`,
    "crm.leads.create": (r) => `Leadet "${(r.output as { name?: string })?.name ?? ""}" er oprettet.`,
    default: () => "Handlingen er udført.",
  },
  en: {
    "email.send": () => "The email was sent.",
    "tasks.create": (r) => `The task "${(r.output as { title?: string })?.title ?? ""}" was created.`,
    "calendar.create_event": (r) => `The meeting "${(r.output as { title?: string })?.title ?? ""}" was booked.`,
    "crm.leads.create": (r) => `The lead "${(r.output as { name?: string })?.name ?? ""}" was created.`,
    default: () => "The action was completed.",
  },
  de: {
    "email.send": () => "Die E-Mail wurde gesendet.",
    "tasks.create": (r) => `Die Aufgabe "${(r.output as { title?: string })?.title ?? ""}" wurde erstellt.`,
    "calendar.create_event": (r) => `Der Termin "${(r.output as { title?: string })?.title ?? ""}" wurde gebucht.`,
    "crm.leads.create": (r) => `Der Lead "${(r.output as { name?: string })?.name ?? ""}" wurde erstellt.`,
    default: () => "Die Aktion wurde ausgeführt.",
  },
};

const FAILURE_PREFIX: Record<SupportedLanguage, string> = {
  da: "kunne ikke udføres",
  en: "could not be completed",
  de: "konnte nicht ausgeführt werden",
};

/**
 * Deterministic templating covers the common single/dual-step cases —
 * §R explicitly asks not to burn another LLM call on formatting a result
 * we can already describe in code. Falls back to one short LLM
 * summarization only for results too varied to template (3+ steps, or a
 * step type with no template).
 */
export async function generateResponse(records: StepExecutionRecord[], language: SupportedLanguage): Promise<string> {
  if (records.length === 0) return language === "da" ? "Jeg fandt ingen relevant handling for det." : language === "de" ? "Dazu habe ich keine passende Aktion gefunden." : "I couldn't find a relevant action for that.";

  const allTemplated = records.length <= 2 && records.every((r) => r.status === "completed" || r.status === "failed");
  if (allTemplated) {
    const parts = records.map((r) => {
      if (r.status === "failed") return `${r.capability} ${FAILURE_PREFIX[language]}${r.error ? ` (${r.error})` : ""}.`;
      const template = TEMPLATES[language][r.capability] ?? TEMPLATES[language].default;
      return template(r);
    });
    return parts.join(" ");
  }

  const summary = records.map((r) => `${r.capability}: ${r.status}${r.error ? ` — ${r.error}` : ""}`).join("; ");
  try {
    return await OllamaClient.chat([
      { role: "system", content: responsePrompt() },
      { role: "user", content: `Language: ${language}. Results: ${summary}` },
    ], { timeoutMs: 15000 });
  } catch {
    // Deterministic fallback if even the summarization call fails —
    // never leave the user with nothing.
    return summary;
  }
}
