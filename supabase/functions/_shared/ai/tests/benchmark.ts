// Benchmark script for the deterministic routing layer.
//
// HONEST SCOPE: this exercises RequestRouter.route() in-process — router
// accuracy and router_ms are real, measured numbers. It does NOT exercise
// llm_ms/planning_ms/execution_ms end-to-end, because that requires a live
// authenticated user session against the deployed ai-message function with
// a real GROQ_API_KEY configured, neither of which this environment has.
//
// Run with: deno run --allow-env --allow-net supabase/functions/_shared/ai/tests/benchmark.ts
import { RequestRouter, type Domain, type ActionType } from "../router/request-router.ts";

interface Case { message: string; expectedLanguage: "da" | "en" | "de"; expectedDomain: Domain; expectedActionType?: ActionType }

const CASES: Case[] = [
  // Danish (10)
  { message: "Vis mine leads", expectedLanguage: "da", expectedDomain: "crm" },
  { message: "Send en mail til Peter", expectedLanguage: "da", expectedDomain: "email" },
  { message: "Book et møde med Peter i morgen", expectedLanguage: "da", expectedDomain: "calendar" },
  { message: "Opret en opgave om at ringe til Peter på mandag", expectedLanguage: "da", expectedDomain: "tasks" },
  { message: "Vis mine åbne fakturaer", expectedLanguage: "da", expectedDomain: "finance" },
  { message: "Hvad er status på mine deals?", expectedLanguage: "da", expectedDomain: "crm" },
  { message: "Find mine ulæste mails", expectedLanguage: "da", expectedDomain: "email" },
  { message: "Vis mine forbundne integrationer", expectedLanguage: "da", expectedDomain: "integrations" },
  { message: "Lav en Facebook-annonce til vores nye kampagne", expectedLanguage: "da", expectedDomain: "marketing" },
  { message: "Vis mine kolleger i virksomheden", expectedLanguage: "da", expectedDomain: "hr" },
  // English (10)
  { message: "Show my leads", expectedLanguage: "en", expectedDomain: "crm" },
  { message: "Send an email to Peter", expectedLanguage: "en", expectedDomain: "email" },
  { message: "Schedule a meeting with Peter tomorrow", expectedLanguage: "en", expectedDomain: "calendar" },
  { message: "Create a task to call Peter on Monday", expectedLanguage: "en", expectedDomain: "tasks" },
  { message: "Show my unpaid invoices", expectedLanguage: "en", expectedDomain: "finance" },
  { message: "What's the status of my deals?", expectedLanguage: "en", expectedDomain: "crm" },
  { message: "Find my unread emails", expectedLanguage: "en", expectedDomain: "email" },
  { message: "Show my connected integrations", expectedLanguage: "en", expectedDomain: "integrations" },
  { message: "Create a Facebook ad for our new campaign", expectedLanguage: "en", expectedDomain: "marketing" },
  { message: "Show my colleagues at the company", expectedLanguage: "en", expectedDomain: "hr" },
  // German (10)
  { message: "Zeig mir meine Leads", expectedLanguage: "de", expectedDomain: "crm" },
  { message: "Schick Peter eine E-Mail", expectedLanguage: "de", expectedDomain: "email" },
  { message: "Vereinbare morgen einen Termin mit Peter", expectedLanguage: "de", expectedDomain: "calendar" },
  { message: "Erstelle eine Aufgabe, Peter am Montag anzurufen", expectedLanguage: "de", expectedDomain: "tasks" },
  { message: "Zeig mir meine offenen Rechnungen", expectedLanguage: "de", expectedDomain: "finance" },
  { message: "Wie ist der Status meiner Deals?", expectedLanguage: "de", expectedDomain: "crm" },
  { message: "Finde meine ungelesenen E-Mails", expectedLanguage: "de", expectedDomain: "email" },
  { message: "Zeig mir meine verbundenen Integrationen", expectedLanguage: "de", expectedDomain: "integrations" },
  { message: "Erstelle eine Facebook-Anzeige für unsere neue Kampagne", expectedLanguage: "de", expectedDomain: "marketing" },
  { message: "Zeig mir meine Kollegen im Unternehmen", expectedLanguage: "de", expectedDomain: "hr" },
];

async function run() {
  let languageCorrect = 0;
  let domainCorrect = 0;
  let deterministicCount = 0;
  const timings: number[] = [];
  const wrongDomain: string[] = [];

  for (const c of CASES) {
    const started = performance.now();
    const result = await RequestRouter.route(c.message);
    const ms = performance.now() - started;
    timings.push(ms);

    if (result.language === c.expectedLanguage) languageCorrect++;
    if (result.domain === c.expectedDomain) domainCorrect++;
    else wrongDomain.push(`"${c.message}" → got ${result.domain}, expected ${c.expectedDomain}`);
    if (result.deterministic) deterministicCount++;
  }

  const total = CASES.length;
  const avgMs = timings.reduce((a, b) => a + b, 0) / total;
  const maxMs = Math.max(...timings);

  console.log(`\n=== Router benchmark: ${total} requests (10 da / 10 en / 10 de) ===`);
  console.log(`Language detection accuracy: ${languageCorrect}/${total} (${((languageCorrect / total) * 100).toFixed(0)}%)`);
  console.log(`Domain routing accuracy:     ${domainCorrect}/${total} (${((domainCorrect / total) * 100).toFixed(0)}%)`);
  console.log(`Deterministic (no LLM call): ${deterministicCount}/${total}`);
  console.log(`router_ms avg: ${avgMs.toFixed(2)}ms, max: ${maxMs.toFixed(2)}ms`);
  if (wrongDomain.length) {
    console.log(`\nWrong-domain cases:`);
    wrongDomain.forEach((w) => console.log(`  - ${w}`));
  }
  console.log(`\nNOTE: llm_ms/planning_ms/execution_ms are NOT included — those require`);
  console.log(`a live authenticated call to the deployed ai-message function with a real`);
  console.log(`GROQ_API_KEY configured, which this environment doesn't have. Re-run against`);
  console.log(`a real deployment for full-stack numbers.`);
}

await run();
