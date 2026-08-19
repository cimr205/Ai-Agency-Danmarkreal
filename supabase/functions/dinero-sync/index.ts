import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCompanyAuth } from "../_shared/auth.ts";

const DINERO_TOKEN_URL = "https://connect.visma.com/connect/token";
const DINERO_API_BASE = "https://api.dinero.dk/v1";

type DineroConnection = {
  id: string;
  company_id: string;
  dinero_organization_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
};

async function getValidAccessToken(supabase: SupabaseClient, conn: DineroConnection): Promise<string> {
  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) return conn.access_token;

  const clientId = Deno.env.get("DINERO_CLIENT_ID")!;
  const clientSecret = Deno.env.get("DINERO_CLIENT_SECRET")!;
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(DINERO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basicAuth}` },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    await supabase.from("dinero_connections").update({ status: "error", last_sync_error: "refresh_failed" }).eq("id", conn.id);
    throw new Error("Failed to refresh Dinero token — reconnect required");
  }

  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await supabase
    .from("dinero_connections")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token || conn.refresh_token,
      token_expires_at: newExpiresAt,
      status: "connected",
    })
    .eq("id", conn.id);

  return data.access_token;
}

async function dineroFetch(token: string, orgId: string, path: string, init?: RequestInit) {
  const res = await fetch(`${DINERO_API_BASE}/${orgId}${path}`, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Dinero API ${path} failed: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await requireCompanyAuth(req);
    if (ctx instanceof Response) return ctx;
    const { supabase, user, companyId } = ctx;

    const { action, customer_id, invoice_id } = await req.json();

    const { data: conn } = await supabase.from("dinero_connections").select("*").eq("company_id", companyId).single();
    if (!conn || conn.status !== "connected") {
      return new Response(JSON.stringify({ error: "Dinero not connected" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = await getValidAccessToken(supabase, conn as DineroConnection);
    const orgId = conn.dinero_organization_id;

    if (action === "push_customer") {
      const { data: customer, error } = await supabase.from("customers").select("*").eq("id", customer_id).eq("company_id", companyId).single();
      if (error || !customer) throw new Error("Customer not found");

      const payload = {
        name: customer.name,
        email: customer.email || undefined,
        phone: customer.phone || undefined,
        address: customer.address || undefined,
        vatNumber: customer.vat_number || undefined,
        isPerson: customer.customer_type !== "business",
      };

      let dinero;
      if (customer.dinero_contact_guid) {
        dinero = await dineroFetch(token, orgId, `/contacts/${customer.dinero_contact_guid}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        dinero = await dineroFetch(token, orgId, `/contacts`, { method: "POST", body: JSON.stringify(payload) });
      }

      await supabase.from("customers").update({
        dinero_contact_guid: dinero.ContactGuid || dinero.contactGuid || customer.dinero_contact_guid,
        accounting_synced_at: new Date().toISOString(),
      }).eq("id", customer_id);

      return new Response(JSON.stringify({ success: true, dinero_contact: dinero }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "push_invoice") {
      const { data: invoice, error } = await supabase.from("invoices").select("*, customers(*)").eq("id", invoice_id).eq("company_id", companyId).single();
      if (error || !invoice) throw new Error("Invoice not found");

      let contactGuid = invoice.customers?.dinero_contact_guid;
      if (!contactGuid && invoice.customers) {
        const contact = await dineroFetch(token, orgId, `/contacts`, {
          method: "POST",
          body: JSON.stringify({ name: invoice.customers.name, email: invoice.customers.email, vatNumber: invoice.customers.vat_number }),
        });
        contactGuid = contact.ContactGuid || contact.contactGuid;
        await supabase.from("customers").update({ dinero_contact_guid: contactGuid }).eq("id", invoice.customer_id);
      }

      const lines = Array.isArray(invoice.lines) && invoice.lines.length > 0
        ? invoice.lines
        : [{ description: invoice.notes || "Faktura", quantity: 1, unitPrice: invoice.subtotal || invoice.amount }];

      const payload = {
        contactGuid,
        date: invoice.issued_at,
        dueDate: invoice.due_date || undefined,
        productLines: lines.map((l: Record<string, unknown>) => ({
          description: l.description || l.name || "Vare",
          quantity: l.quantity || 1,
          unitPrice: l.unitPrice || l.unit_price || l.price || 0,
        })),
      };

      const dinero = await dineroFetch(token, orgId, `/invoices`, { method: "POST", body: JSON.stringify(payload) });

      await supabase.from("invoices").update({
        dinero_voucher_guid: dinero.Guid || dinero.guid,
        accounting_synced_at: new Date().toISOString(),
      }).eq("id", invoice_id);

      return new Response(JSON.stringify({ success: true, dinero_invoice: dinero }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "pull_customers") {
      const contacts = await dineroFetch(token, orgId, `/contacts`);
      const list = Array.isArray(contacts) ? contacts : contacts?.Collection || [];

      let imported = 0;
      for (const c of list) {
        const guid = c.ContactGuid || c.contactGuid;
        if (!guid || !c.Name) continue;
        const { data: existing } = await supabase.from("customers").select("id").eq("company_id", companyId).eq("dinero_contact_guid", guid).maybeSingle();
        if (existing) continue;

        await supabase.from("customers").insert({
          company_id: companyId,
          name: c.Name || c.name,
          email: c.Email || c.email || `${(c.Name || "kunde").toLowerCase().replace(/\s+/g, ".")}@ukendt.dk`,
          phone: c.Phone || c.phone || null,
          vat_number: c.VatNumber || c.vatNumber || null,
          dinero_contact_guid: guid,
          created_by: user.id,
          accounting_synced_at: new Date().toISOString(),
        });
        imported++;
      }

      return new Response(JSON.stringify({ success: true, imported }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("dinero-sync error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
