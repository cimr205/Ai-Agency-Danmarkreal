import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sanitizeAppReturnUrl } from "./appReturnUrl.ts";

Deno.test("accepts app pages on allowed origins and strips query/hash", () => {
  assertEquals(
    sanitizeAppReturnUrl("https://www.aiagencydanmark.dk/da/app/email/emails?x=1#y"),
    "https://www.aiagencydanmark.dk/da/app/email/emails",
  );
  assertEquals(
    sanitizeAppReturnUrl("http://localhost:8080/de/app/email/emails"),
    "http://localhost:8080/de/app/email/emails",
  );
});

Deno.test("rejects foreign origins, lookalikes and non-app paths", () => {
  for (const raw of [
    "https://evil.example/da/app/email/emails",
    "https://www.aiagencydanmark.dk.evil.example/da/app/email/emails",
    "https://www.aiagencydanmark.dk/xx/app/email/emails",
    "https://www.aiagencydanmark.dk/da/auth/login",
    "javascript:alert(1)",
    "/da/app/email/emails",
    "",
    null,
    42,
  ]) {
    assertEquals(sanitizeAppReturnUrl(raw), null, String(raw));
  }
});
