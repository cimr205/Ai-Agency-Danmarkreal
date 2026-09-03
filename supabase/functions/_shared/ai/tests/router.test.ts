import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { RequestRouter } from "../router/request-router.ts";
import { detectLanguage } from "../router/language.ts";

// TEST 1: "Vis mine leads" → crm, read, no email tools implied.
Deno.test("router: 'vis mine leads' routes to crm/read", async () => {
  const result = await RequestRouter.route("Vis mine leads");
  assertEquals(result.domain, "crm");
  assertEquals(result.actionType, "read");
  assertEquals(result.language, "da");
  assertEquals(result.deterministic, true);
});

// TEST 2: "Send en mail til Peter" → email/execute (the planner adds the
// contacts.search step; the router's job is only domain classification).
Deno.test("router: 'send en mail til Peter' routes to email/execute", async () => {
  const result = await RequestRouter.route("Send en mail til Peter");
  assertEquals(result.domain, "email");
  assertEquals(result.actionType, "execute");
});

// TEST 4: "Book et møde med Peter i morgen" → calendar/execute.
Deno.test("router: 'book et møde med Peter i morgen' routes to calendar/execute", async () => {
  const result = await RequestRouter.route("Book et møde med Peter i morgen");
  assertEquals(result.domain, "calendar");
  assertEquals(result.actionType, "execute");
});

// TEST 5: German — "Zeig mir meine Leads" → language=de, crm.
Deno.test("router: German 'Zeig mir meine Leads' detects de + crm", async () => {
  const result = await RequestRouter.route("Zeig mir meine Leads");
  assertEquals(result.language, "de");
  assertEquals(result.domain, "crm");
});

Deno.test("language: detects da/en/de from stopwords, not just special characters", () => {
  assertEquals(detectLanguage("Jeg vil gerne se mine opgaver i dag"), "da");
  assertEquals(detectLanguage("I would like to see my tasks for today"), "en");
  assertEquals(detectLanguage("Ich möchte meine Aufgaben für heute sehen"), "de");
});

Deno.test("router: English 'schedule a follow-up task' routes to tasks/execute", async () => {
  const result = await RequestRouter.route("Please schedule a follow-up task for tomorrow");
  assertEquals(result.domain, "tasks");
  assertEquals(result.actionType, "execute");
  assertEquals(result.language, "en");
});
