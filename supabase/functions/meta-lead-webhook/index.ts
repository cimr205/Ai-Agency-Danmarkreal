import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
import { decryptMetaToken } from "../_shared/metaToken.ts";

const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
const hex = (bytes:ArrayBuffer) => [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,"0")).join("");
const safeEqual = (a:string,b:string) => {
  if(a.length!==b.length) return false;
  let mismatch=0; for(let i=0;i<a.length;i++) mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
  return mismatch===0;
};

Deno.serve(async (req) => {
  const url=new URL(req.url);
  if(req.method==="GET"){
    if(url.searchParams.get("hub.mode")==="subscribe" && url.searchParams.get("hub.verify_token")===Deno.env.get("META_WEBHOOK_VERIFY_TOKEN"))
      return new Response(url.searchParams.get("hub.challenge")??"",{status:200});
    return new Response("Forbidden",{status:403});
  }
  if(req.method!=="POST") return new Response("Method not allowed",{status:405});
  const raw=await req.text();
  const secret=Deno.env.get("META_APP_SECRET")??"";
  const supplied=req.headers.get("x-hub-signature-256")??"";
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const expected=`sha256=${hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)))}`;
  if(!secret || !safeEqual(supplied,expected)) return new Response("Invalid signature",{status:401});
  const payload=JSON.parse(raw) as {entry?:Array<{id?:string;changes?:Array<{field?:string;value?:{leadgen_id?:string;form_id?:string;ad_id?:string;page_id?:string}}>} >};
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const outcomes=[];
  for(const entry of payload.entry??[]) for(const change of entry.changes??[]){
    if(change.field!=="leadgen") continue;
    const leadId=change.value?.leadgen_id; const pageId=change.value?.page_id??entry.id;
    if(!leadId||!pageId) continue;
    const receiptId=`meta:${pageId}:${leadId}`;
    const {data:source}=await db.from("meta_webhook_sources").select("company_id,ad_account_id,meta_connections!inner(access_token_ciphertext,token_iv,status)").eq("page_id",pageId).maybeSingle();
    if(!source){ outcomes.push({lead_id:leadId,status:"unresolved_page"}); continue; }
    const {data:receipt,error:receiptError}=await db.from("provider_webhook_receipts").insert({provider:"meta",external_event_id:receiptId,company_id:source.company_id,payload:change}).select("id").maybeSingle();
    if(receiptError?.code==="23505"){ outcomes.push({lead_id:leadId,status:"duplicate"}); continue; }
    if(receiptError||!receipt) throw receiptError??new Error("Receipt insert failed");
    try{
      const connection=Array.isArray(source.meta_connections)?source.meta_connections[0]:source.meta_connections;
      if(!connection?.access_token_ciphertext||!connection.token_iv||connection.status!=="connected") throw new Error("Meta connection unavailable");
      const token=await decryptMetaToken(connection.access_token_ciphertext,connection.token_iv);
      const response=await fetch(`https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION")??"v26.0"}/${encodeURIComponent(leadId)}?fields=id,created_time,field_data,campaign_id,adset_id,ad_id,form_id`,{headers:{authorization:`Bearer ${token}`}});
      const lead=await response.json(); if(!response.ok||lead.error) throw new Error(lead.error?.message??`Meta HTTP ${response.status}`);
      const fields=Array.isArray(lead.field_data)?lead.field_data as Array<{name?:string;values?:unknown[]}>:[];
      const value=(...names:string[])=>{const row=fields.find(f=>names.includes(String(f.name??"").toLowerCase()));return row?.values?.[0]==null?null:String(row.values[0]);};
      const email=value("email","email_address"); const name=value("full_name","name")??([value("first_name"),value("last_name")].filter(Boolean).join(" ")||email||"Meta lead");
      const {data,error}=await db.rpc("ingest_meta_lead",{p_company_id:source.company_id,p_account_id:source.ad_account_id,p_external_lead_id:leadId,p_name:name,p_email:email,p_phone:value("phone_number","phone"),p_campaign_id:lead.campaign_id??null,p_adset_id:lead.adset_id??null,p_ad_id:lead.ad_id??change.value?.ad_id??null,p_form_id:lead.form_id??change.value?.form_id??null,p_created_at:lead.created_time??new Date().toISOString(),p_raw:lead});
      if(error) throw error;
      await db.from("provider_webhook_receipts").update({status:"processed",processed_at:new Date().toISOString()}).eq("id",receipt.id);
      outcomes.push({lead_id:leadId,status:"processed",result:data});
    }catch(cause){const message=cause instanceof Error?cause.message:String(cause);await db.from("provider_webhook_receipts").update({status:"failed",error:message,processed_at:new Date().toISOString()}).eq("id",receipt.id);outcomes.push({lead_id:leadId,status:"failed"});}
  }
  return json({received:true,outcomes});
});
