import Stripe from "https://esm.sh/stripe@18.5.0";
import { assertRejects } from "jsr:@std/assert@1";

Deno.test("Stripe fixture accepts a valid signature and rejects a tampered payload",async()=>{
  const stripe=new Stripe("sk_test_fixture",{apiVersion:"2025-08-27.basil"});
  const payload='{"id":"evt_fixture","type":"checkout.session.completed"}';
  const secret="whsec_fixture";
  const timestamp=Math.floor(Date.now()/1000);
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signed=`${timestamp}.${payload}`;
  const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(signed)));
  const digest=[...bytes].map((value)=>value.toString(16).padStart(2,"0")).join("");
  const header=`t=${timestamp},v1=${digest}`;
  await stripe.webhooks.constructEventAsync(payload,header,secret);
  await assertRejects(()=>stripe.webhooks.constructEventAsync(`${payload} `,header,secret));
});
