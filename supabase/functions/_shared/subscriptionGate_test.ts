import { assertEquals } from "jsr:@std/assert@1";
import { decideGate, SUBSCRIPTION_REQUIRED } from "./subscriptionDecision.ts";

Deno.test("company with access passes the gate", () => {
  assertEquals(decideGate({ ok: true, hasAccess: true }), null);
});

Deno.test("company without access gets 402 subscription_required", async () => {
  const res = decideGate({ ok: true, hasAccess: false });
  assertEquals(res?.status, 402);
  const body = await res!.json();
  assertEquals(body.error, SUBSCRIPTION_REQUIRED);
  assertEquals(res!.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("lookup error fails open (does not lock out paying customers)", () => {
  const orig = console.error;
  console.error = () => {};
  try {
    assertEquals(decideGate({ ok: false, error: "rpc down" }), null);
  } finally {
    console.error = orig;
  }
});
