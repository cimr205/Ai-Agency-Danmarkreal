import type { SupportedLanguage } from "../model/model.types.ts";

// Deterministic language detection — no LLM call. Scores common function
// words per language (stopwords are the most reliable signal at short
// message length, far more than named entities or spelling).
const MARKERS: Record<SupportedLanguage, RegExp[]> = {
  da: [/\bog\b/i, /\bikke\b/i, /\bjeg\b/i, /\ber\b/i, /\bpå\b/i, /\ben\b/i, /\bmin(e)?\b/i, /\bmit\b/i, /\bhan\b/i, /\bham\b/i, /\bfor\b/i, /\btil\b/i, /\bmøde\b/i, /\bmail\b/i, /\bvis\b/i, /\bhvad\b/i, /\bhvordan\b/i, /\bdenne\b/i, /\bmed\b/i, /\bkan\b/i, /\bskal\b/i, /[æøå]/i],
  de: [/\bund\b/i, /\bnicht\b/i, /\bich\b/i, /\bist\b/i, /\bein\b/i, /\bmeine?\b/i, /\ber\b/i, /\bihm\b/i, /\bfür\b/i, /\bmorgen\b/i, /\btermin\b/i, /\bschick\b/i, /[äöüß]/i],
  en: [/\band\b/i, /\bnot\b/i, /\bI\b/, /\bis\b/i, /\ba\b/i, /\bmy\b/i, /\bhe\b/i, /\bhim\b/i, /\bfor\b/i, /\btomorrow\b/i, /\bmeeting\b/i, /\bemail\b/i],
};

export function detectLanguage(text: string, fallback: SupportedLanguage = "en"): SupportedLanguage {
  const scores: Record<SupportedLanguage, number> = { da: 0, en: 0, de: 0 };
  for (const [lang, patterns] of Object.entries(MARKERS) as [SupportedLanguage, RegExp[]][]) {
    for (const pattern of patterns) if (pattern.test(text)) scores[lang]++;
  }
  const best = (Object.entries(scores) as [SupportedLanguage, number][]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : fallback;
}
