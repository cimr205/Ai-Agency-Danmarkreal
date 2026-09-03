import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { matchFastIntent } from "../router/fast-intent-router.ts";

// §31 DANSK/ENGLISH/GERMAN: these must resolve without ever touching the
// model provider — matchFastIntent is pure/synchronous, so a passing test
// here is direct proof no Groq call happens for these phrasings.
Deno.test("fast-intent: 'Vis mine leads' matches crm.leads.search deterministically", () => {
  const result = matchFastIntent("Vis mine leads");
  assertEquals(result.matched, true);
  if (result.matched) {
    assertEquals(result.capability, "crm.leads.search");
    assertEquals(result.language, "da");
    assertEquals(result.confidence >= 0.9, true);
  }
});

Deno.test("fast-intent: 'Show my leads' matches crm.leads.search deterministically", () => {
  const result = matchFastIntent("Show my leads");
  assertEquals(result.matched, true);
  if (result.matched) assertEquals(result.capability, "crm.leads.search");
});

Deno.test("fast-intent: 'Zeig mir meine Leads' matches crm.leads.search deterministically", () => {
  const result = matchFastIntent("Zeig mir meine Leads");
  assertEquals(result.matched, true);
  if (result.matched) { assertEquals(result.capability, "crm.leads.search"); assertEquals(result.language, "de"); }
});

Deno.test("fast-intent: covers tasks/calendar/email/integrations/invoices/hr/reporting/files", () => {
  const cases: [string, string][] = [
    ["Vis mine opgaver", "tasks.search"],
    ["Vis min kalender", "calendar.search_events"],
    ["Vis mine mails", "email.search"],
    ["Vis mine integrationer", "integrations.list"],
    ["Vis mine fakturaer", "invoices.search"],
    ["Vis mine medarbejdere", "hr.employees.search"],
    ["Vis mit dashboard", "reporting.dashboard.read"],
    ["Vis mine dokumenter", "files.search"],
  ];
  for (const [message, expected] of cases) {
    const result = matchFastIntent(message);
    assertEquals(result.matched, true, `"${message}" should match`);
    if (result.matched) assertEquals(result.capability, expected, `"${message}" should map to ${expected}`);
  }
});

// Complex/ambiguous requests must NOT fast-path — they need the planner.
Deno.test("fast-intent: complex multi-intent messages do not match (must go to planner)", () => {
  assertEquals(matchFastIntent("Find Peter og send ham en mail").matched, false);
  assertEquals(matchFastIntent("Find alle leads vi ikke har kontaktet i 30 dage og lav opgaver på dem").matched, false);
  assertEquals(matchFastIntent("Send en mail til Peter").matched, false);
});
