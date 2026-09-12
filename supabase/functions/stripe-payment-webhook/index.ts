import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});

Deno.serve(async(req)=>{
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const signature=req.headers.get("stripe-signature"); const secret=Deno.env.get("STRIPE_PAYMENT_WEBHOOK_SECRET");
  if(!signature||!secret) return json({error:"Webhook signature unavailable"},401);
  const raw=await req.text(); const stripe=new Stripe(Deno.env.get("STRIPE_SECRET_KEY")??"",{apiVersion:"2025-08-27.basil"});
  let event:Stripe.Event;
  try{event=await stripe.webhooks.constructEventAsync(raw,signature,secret);}catch{return json({error:"Invalid signature"},401);}
  if(event.type!=="payment_intent.succeeded" && event.type!=="charge.succeeded") return json({received:true,ignored:true});
  const object=event.data.object as Stripe.PaymentIntent|Stripe.Charge;
  const reference=object.metadata?.invoice_payment_reference;
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  if(!reference){
    await db.from("provider_webhook_receipts").upsert({provider:"stripe",external_event_id:event.id,status:"unresolved",payload:event,error:"Missing invoice_payment_reference"},{onConflict:"provider,external_event_id"});
    return json({received:true,status:"unresolved"},202);
  }
  const {data:invoice}=await db.from("invoices").select("id,company_id,amount").eq("payment_reference",reference).maybeSingle();
  if(!invoice){
    await db.from("provider_webhook_receipts").upsert({provider:"stripe",external_event_id:event.id,status:"unresolved",payload:event,error:"Unknown invoice_payment_reference"},{onConflict:"provider,external_event_id"});
    return json({received:true,status:"unresolved"},202);
  }
  const {data:existing}=await db.from("provider_webhook_receipts").select("id,status").eq("provider","stripe").eq("external_event_id",event.id).maybeSingle();
  if(existing?.status==="processed") return json({received:true,status:"duplicate"});
  const {data:receipt,error:receiptError}=await db.from("provider_webhook_receipts").upsert({provider:"stripe",external_event_id:event.id,company_id:invoice.company_id,status:"received",payload:event,error:null},{onConflict:"provider,external_event_id"}).select("id").single();
  if(receiptError) return json({error:"Receipt persistence failed"},500);
  const amount=("amount_received" in object?object.amount_received:object.amount)/100;
  const {data,error}=await db.rpc("register_invoice_payment_service",{p_company_id:invoice.company_id,p_invoice_id:invoice.id,p_amount:amount,p_payment_method:"stripe",p_paid_at:new Date(event.created*1000).toISOString(),p_idempotency_key:`stripe:${event.id}`,p_external_reference:object.id,p_metadata:{provider:"stripe",event_id:event.id}});
  if(error){await db.from("provider_webhook_receipts").update({status:"failed",error:error.message,processed_at:new Date().toISOString()}).eq("id",receipt.id);return json({error:"Payment registration failed"},500);}
  await db.from("provider_webhook_receipts").update({status:"processed",processed_at:new Date().toISOString()}).eq("id",receipt.id);
  return json({received:true,status:"processed",result:data});
});
