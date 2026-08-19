import { corsHeaders } from "../_shared/cors.ts";
import { requireCompanyAuth } from "../_shared/auth.ts";

const ECONOMIC_API_BASE = "https://restapi.e-conomic.com";

async function economicFetch(appSecretToken: string, grantToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`${ECONOMIC_API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "X-AppSecretToken": appSecretToken,
      "X-AgreementGrantToken": grantToken,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`e-conomic API ${path} failed: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await requireCompanyAuth(req);
    if (ctx instanceof Response) return ctx;
    const { supabase, user, companyId } = ctx;

    const { action, customer_id, invoice_id } = await req.json();

    const { data: conn } = await supabase.from("economic_connections").select("*").eq("company_id", companyId).single();
    if (!conn || conn.status !== "connected") {
      return new Response(JSON.stringify({ error: "e-conomic not connected" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const appSecretToken = Deno.env.get("ECONOMIC_APP_SECRET_TOKEN")!;
    const grantToken = conn.agreement_grant_token;

    if (action === "push_customer") {
      const { data: customer, error } = await supabase.from("customers").select("*").eq("id", customer_id).eq("company_id", companyId).single();
      if (error || !customer) throw new Error("Customer not found");

      if (customer.economic_customer_number) {
        await economicFetch(appSecretToken, grantToken, `/customers/${customer.economic_customer_number}`, {
          method: "PUT",
          body: JSON.stringify({
            customerNumber: customer.economic_customer_number,
            name: customer.name,
            email: customer.email || undefined,
            address: customer.address || undefined,
            vatZone: { name: customer.country === "DK" ? "Denmark" : "EU", vatZoneNumber: customer.country === "DK" ? 1 : 2 },
            customerGroup: { customerGroupNumber: 1 },
            paymentTerms: { paymentTermsNumber: 1 },
          }),
        });
        await supabase.from("customers").update({ accounting_synced_at: new Date().toISOString() }).eq("id", customer_id);
        return new Response(JSON.stringify({ success: true, customer_number: customer.economic_customer_number }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Find next free customer number
      const nextNumberData = await economicFetch(appSecretToken, grantToken, `/customers/next-available-number`).catch(() => null);
      const customerNumber = nextNumberData?.customerNumber || Math.floor(Date.now() / 1000) % 100000;

      const created = await economicFetch(appSecretToken, grantToken, `/customers`, {
        method: "POST",
        body: JSON.stringify({
          customerNumber,
          name: customer.name,
          email: customer.email || undefined,
          address: customer.address || undefined,
          vatZone: { name: customer.country === "DK" ? "Denmark" : "EU", vatZoneNumber: customer.country === "DK" ? 1 : 2 },
          customerGroup: { customerGroupNumber: 1 },
          paymentTerms: { paymentTermsNumber: 1 },
        }),
      });

      await supabase.from("customers").update({
        economic_customer_number: created.customerNumber || customerNumber,
        accounting_synced_at: new Date().toISOString(),
      }).eq("id", customer_id);

      return new Response(JSON.stringify({ success: true, economic_customer: created }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "push_invoice") {
      const { data: invoice, error } = await supabase.from("invoices").select("*, customers(*)").eq("id", invoice_id).eq("company_id", companyId).single();
      if (error || !invoice) throw new Error("Invoice not found");

      let customerNumber = invoice.customers?.economic_customer_number;
      if (!customerNumber && invoice.customers) {
        const nextNumberData = await economicFetch(appSecretToken, grantToken, `/customers/next-available-number`).catch(() => null);
        customerNumber = nextNumberData?.customerNumber || Math.floor(Date.now() / 1000) % 100000;
        await economicFetch(appSecretToken, grantToken, `/customers`, {
          method: "POST",
          body: JSON.stringify({
            customerNumber,
            name: invoice.customers.name,
            email: invoice.customers.email || undefined,
            vatZone: { name: "Denmark", vatZoneNumber: 1 },
            customerGroup: { customerGroupNumber: 1 },
            paymentTerms: { paymentTermsNumber: 1 },
          }),
        });
        await supabase.from("customers").update({ economic_customer_number: customerNumber }).eq("id", invoice.customer_id);
      }

      const lines = Array.isArray(invoice.lines) && invoice.lines.length > 0
        ? invoice.lines
        : [{ description: invoice.notes || "Faktura", quantity: 1, unitPrice: invoice.subtotal || invoice.amount }];

      const draft = await economicFetch(appSecretToken, grantToken, `/invoices/drafts`, {
        method: "POST",
        body: JSON.stringify({
          date: invoice.issued_at,
          customer: { customerNumber },
          paymentTerms: { paymentTermsNumber: 1 },
          lines: lines.map((l: Record<string, unknown>, i: number) => ({
            lineNumber: i + 1,
            description: l.description || l.name || "Vare",
            quantity: l.quantity || 1,
            unitNetPrice: l.unitPrice || l.unit_price || l.price || 0,
          })),
        }),
      });

      await supabase.from("invoices").update({
        economic_invoice_number: draft.draftInvoiceNumber || draft.bookedInvoiceNumber || null,
        accounting_synced_at: new Date().toISOString(),
      }).eq("id", invoice_id);

      return new Response(JSON.stringify({ success: true, economic_invoice: draft }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "pull_customers") {
      const customersData = await economicFetch(appSecretToken, grantToken, `/customers?pagesize=1000`);
      const list = customersData?.collection || [];

      let imported = 0;
      for (const c of list) {
        if (!c.customerNumber || !c.name) continue;
        const { data: existing } = await supabase.from("customers").select("id").eq("company_id", companyId).eq("economic_customer_number", c.customerNumber).maybeSingle();
        if (existing) continue;

        await supabase.from("customers").insert({
          company_id: companyId,
          name: c.name,
          email: c.email || `${String(c.name).toLowerCase().replace(/\s+/g, ".")}@ukendt.dk`,
          address: c.address || null,
          economic_customer_number: c.customerNumber,
          created_by: user.id,
          accounting_synced_at: new Date().toISOString(),
        });
        imported++;
      }

      return new Response(JSON.stringify({ success: true, imported }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("economic-sync error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
