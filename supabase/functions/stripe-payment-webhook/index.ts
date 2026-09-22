import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map((value)=>value.toString(16).padStart(2,"0")).join("");
export const hashPaymentReference=async(value:string)=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));

Deno.serve(async(req)=>{
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const signature=req.headers.get("stripe-signature");
  const webhookSecret=Deno.env.get("STRIPE_PAYMENT_WEBHOOK_SECRET");
  if(!signature||!webhookSecret) return json({error:"Webhook signature unavailable"},401);
  const raw=await req.text();
  const stripe=new Stripe(Deno.env.get("STRIPE_SECRET_KEY")??"",{apiVersion:"2025-08-27.basil"});
  let event:Stripe.Event;
  try{event=await stripe.webhooks.constructEventAsync(raw,signature,webhookSecret);}catch{return json({error:"Invalid signature"},401);}
  if(event.type!=="checkout.session.completed") return json({received:true,ignored:true});

  const session=event.data.object as Stripe.Checkout.Session;
  const reference=session.metadata?.invoice_payment_reference;
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:receipt,error:receiptError}=await db.from("provider_webhook_receipts").insert({provider:"stripe",external_event_id:event.id,status:"received",payload:event}).select("id").maybeSingle();
  if(receiptError?.code==="23505") return json({received:true,status:"duplicate"});
  if(receiptError||!receipt) return json({error:"Receipt persistence failed"},500);
  const fail=async(error:string)=>{
    await db.from("provider_webhook_receipts").update({status:"unresolved",error,processed_at:new Date().toISOString()}).eq("id",receipt.id);
    return json({received:true,status:"unresolved"},202);
  };
  if(!reference) return fail("Missing invoice payment reference");
  if(session.payment_status!=="paid") return fail("Checkout session is not paid");

  const {data:resolved,error:resolveError}=await db.rpc("resolve_invoice_payment_reference",{p_token_hash:await hashPaymentReference(reference),p_session_id:session.id});
  if(resolveError||!Array.isArray(resolved)||resolved.length!==1) return fail("Invalid, expired, consumed or ambiguous invoice payment reference");
  const invoice=resolved[0] as {reference_id:string;company_id:string;invoice_id:string;amount:number};
  await db.from("provider_webhook_receipts").update({company_id:invoice.company_id}).eq("id",receipt.id);
  const amount=Number(session.amount_total??0)/100;
  if(amount!==Number(invoice.amount)) return fail("Checkout amount does not match invoice");

  const {data,error}=await db.rpc("register_invoice_payment_service",{
    p_company_id:invoice.company_id,p_invoice_id:invoice.invoice_id,p_amount:amount,p_payment_method:"stripe",
    p_paid_at:new Date(event.created*1000).toISOString(),p_idempotency_key:`stripe:${event.id}`,
    p_external_reference:String(session.payment_intent??session.id),p_metadata:{provider:"stripe",event_id:event.id,checkout_session_id:session.id},
  });
  if(error){
    await db.from("provider_webhook_receipts").update({status:"failed",error:error.message,processed_at:new Date().toISOString()}).eq("id",receipt.id);
    return json({error:"Payment registration failed"},500);
  }
  const {error:consumeError}=await db.rpc("consume_invoice_payment_reference",{p_reference_id:invoice.reference_id,p_company_id:invoice.company_id});
  if(consumeError) console.error("Payment reference consumption failed",consumeError);
  await db.from("provider_webhook_receipts").update({status:"processed",processed_at:new Date().toISOString()}).eq("id",receipt.id);
  return json({received:true,status:"processed",result:data});
});
