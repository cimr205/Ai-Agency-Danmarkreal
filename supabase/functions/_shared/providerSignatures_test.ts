import { assert,assertEquals } from "jsr:@std/assert@1";
import { constantTimeEqual,verifyMetaSignature } from "./providerSignatures.ts";

Deno.test("Meta accepts a valid SHA-256 fixture and rejects tampering",async()=>{
  const raw='{"object":"page","entry":[{"id":"page-fixture"}]}';
  const secret="fixture-secret";
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)));
  const signature=`sha256=${[...bytes].map((value)=>value.toString(16).padStart(2,"0")).join("")}`;
  assert(await verifyMetaSignature(raw,signature,secret));
  assertEquals(await verifyMetaSignature(`${raw} `,signature,secret),false);
  assertEquals(await verifyMetaSignature(raw,"sha256=invalid",secret),false);
});

Deno.test("constant-time comparator rejects unequal fixtures",()=>{
  assert(constantTimeEqual("same","same"));
  assertEquals(constantTimeEqual("same","diff"),false);
  assertEquals(constantTimeEqual("short","longer"),false);
});
