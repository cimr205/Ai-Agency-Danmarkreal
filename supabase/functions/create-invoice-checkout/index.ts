import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const headers={"content-type":"application/json","access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map((value)=>value.toString(16).padStart(2,"0")).join("");
const hash=async(value:string)=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const authorization=req.headers.get("authorization");
  if(!authorization?.startsWith("Bearer ")) return json({error:"Unauthorized"},401);
  const body=await req.json().catch(()=>({})) as {invoice_id?:string};
  if(!body.invoice_id) return json({error:"invoice_id is required"},400);

  const url=Deno.env.get("SUPABASE_URL")!;
  const userDb=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const adminDb=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const token=hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
  const {data:reference,error}=await userDb.rpc("create_invoice_payment_reference",{
    p_invoice_id:body.invoice_id,p_token_hash:await hash(token),p_expires_at:expiresAt,
  });
  if(error) return json({error:error.message},error.code==="P0002"?404:400);

  const record=reference as {reference_id:string;invoice_number:string;amount:number;company_id:string};
  const stripe=new Stripe(Deno.env.get("STRIPE_SECRET_KEY")??"",{apiVersion:"2025-08-27.basil"});
  const appUrl=(Deno.env.get("APP_URL")??"https://www.aiagencydanmark.dk").replace(/\/$/,"");
  try{
    const session=await stripe.checkout.sessions.create({
      mode:"payment",
      line_items:[{price_data:{currency:"dkk",unit_amount:Math.round(Number(record.amount)*100),product_data:{name:`Invoice ${record.invoice_number}`}},quantity:1}],
      success_url:`${appUrl}/en/app/finance/invoices?payment=success`,
      cancel_url:`${appUrl}/en/app/finance/invoices?payment=cancelled`,
      metadata:{invoice_payment_reference:token},
      payment_intent_data:{metadata:{invoice_payment_reference:token}},
      expires_at:Math.floor(Date.now()/1000)+24*60*60,
    });
    const {error:attachError}=await adminDb.rpc("attach_invoice_checkout_session",{
      p_reference_id:record.reference_id,p_company_id:record.company_id,p_session_id:session.id,
    });
    if(attachError) throw attachError;
    return json({checkout_url:session.url,expires_at:expiresAt});
  }catch(cause){
    console.error("create-invoice-checkout",cause);
    return json({error:"Checkout session could not be created"},502);
  }
});
