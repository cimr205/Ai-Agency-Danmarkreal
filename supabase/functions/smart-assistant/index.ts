import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
import { getCompanyAI, AI_NOT_CONNECTED_MESSAGE } from "../_shared/aiConnection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CONTEXT_PROMPTS: Record<string, string> = {
  dashboard: "Du er på Dashboard-siden. Hjælp med overblik over virksomhedens KPI'er, seneste aktivitet og prioriteringer.",
  leads: "Du er på Leads-siden. Fokusér på lead-management: scoring, opfølgning, konvertering og lead-analyse.",
  deals: "Du er på Deals-siden. Fokusér på deals: pipeline-stadier, forventet lukning, deal-værdier og forhandlingsstrategier.",
  pipeline: "Du er på Pipeline-siden. Fokusér på pipeline-management: stadier, flow og konverteringsrater.",
  customers: "Du er på Kunder-siden. Fokusér på kundedata, relationer og kundetilfredshed.",
  invoices: "Du er på Fakturaer-siden. Fokusér på fakturering: udestående beløb, betalingsfrister og momsregler.",
  payments: "Du er på Betalinger-siden. Fokusér på betalingsstatus, forfaldne betalinger og cash flow.",
  employees: "Du er på Medarbejder-siden. Fokusér på HR: medarbejderdata, onboarding og personaleadministration.",
  attendance: "Du er på Fremmøde-siden. Fokusér på fremmøde og tidsregistrering.",
  leave: "Du er på Fravær-siden. Fokusér på fraværsanmodninger og ferieplanering.",
  payroll: "Du er på Løn-siden. Fokusér på lønberegning, udbetalinger og lønstatistik.",
  recruitment: "Du er på Rekruttering-siden. Fokusér på jobopslag, ansøgere og ansættelsesprocesser.",
  tasks: "Du er på Opgaver-siden. Fokusér på task management, deadlines og prioritering af opgaver.",
  calendar: "Du er på Kalender-siden. Fokusér på events, møder og tidsplanlægning.",
  inbox: "Du er på Indbakke-siden. Fokusér på beskeder og intern kommunikation.",
  emails: "Du er på Email-siden. Fokusér på email management og opfølgning.",
  todos: "Du er på To-dos-siden. Fokusér på to-do-lister, prioritering og deadline-tracking.",
  "meta-ads": "Du er på Meta Ads-siden. Fokusér UDELUKKENDE på Meta/Facebook annoncering.",
  settings: "Du er på Indstillinger-siden. Hjælp med virksomhedsopsætning og konfiguration.",
};

const tools = [
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Opret et UDKAST til en email via brugerens Gmail-konto. Sender IKKE emailen — opretter et forslag i handlingskøen, som brugeren selv skal godkende med et klik, før den rent faktisk sendes.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Modtagerens email-adresse" },
          subject: { type: "string", description: "Emnelinje" },
          message: { type: "string", description: "Email-indhold (plain text)" },
          cc: { type: "string", description: "CC email-adresse (valgfrit)" },
        },
        required: ["to", "subject", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_internal_message",
      description: "Send en intern besked til en kollega i virksomheden via indbakken.",
      parameters: {
        type: "object",
        properties: {
          receiver_email: { type: "string", description: "Modtagerens email i systemet" },
          content: { type: "string", description: "Beskedens indhold" },
        },
        required: ["receiver_email", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_cvr",
      description: "Slå en dansk virksomhed op via CVR-nummer og få navn, adresse, status mv. fra det danske CVR-register.",
      parameters: {
        type: "object",
        properties: {
          cvr_number: { type: "string", description: "8-cifret dansk CVR-nummer" },
        },
        required: ["cvr_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Opret en ny opgave i systemet.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Opgavens titel" },
          description: { type: "string", description: "Beskrivelse (valgfrit)" },
          priority: { type: "string", enum: ["low", "medium", "high"], description: "Prioritet" },
          due_date: { type: "string", description: "Deadline i YYYY-MM-DD format (valgfrit)" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_lead",
      description: "Opret et nyt lead i CRM-systemet.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Kontaktpersonens navn" },
          email: { type: "string", description: "Email-adresse" },
          phone: { type: "string", description: "Telefonnummer (valgfrit)" },
          company_name: { type: "string", description: "Virksomhedsnavn (valgfrit)" },
          notes: { type: "string", description: "Noter (valgfrit)" },
          value: { type: "number", description: "Estimeret værdi i DKK (valgfrit)" },
        },
        required: ["name", "email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Opret en begivenhed/møde i kalenderen.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Begivenhedens titel" },
          description: { type: "string", description: "Beskrivelse (valgfrit)" },
          start_time: { type: "string", description: "Starttidspunkt i ISO 8601 format" },
          end_time: { type: "string", description: "Sluttidspunkt i ISO 8601 format" },
        },
        required: ["title", "start_time", "end_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_leads",
      description: "Søg i eksisterende leads efter navn, email eller virksomhed.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Søgeterm" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_tags_to_leads",
      description: "Tilføj et eller flere tags (mapper/kategorier) til leads. Kan filtrere leads efter branche, status, søgeord eller specifikke lead-navne. Brug dette til at organisere leads i mapper som 'Restauranter', 'Varme leads' osv.",
      parameters: {
        type: "object",
        properties: {
          tags: { type: "array", items: { type: "string" }, description: "Liste af tags der skal tilføjes, f.eks. ['Restaurant', 'VIP']" },
          filter_industry: { type: "string", description: "Filtrer leads efter branche: craftsman, marketing, it_software, retail, restaurant, legal_accounting, other (valgfrit)" },
          filter_status: { type: "string", description: "Filtrer leads efter status: new, contacted, qualified, unqualified, customer (valgfrit)" },
          filter_search: { type: "string", description: "Søg i lead-navne/emails/virksomheder (valgfrit)" },
          lead_ids: { type: "array", items: { type: "string" }, description: "Specifikke lead-IDs at tagge (valgfrit – bruges hvis kendte fra søgning)" },
        },
        required: ["tags"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_tags_from_leads",
      description: "Fjern tags fra leads. Kan filtrere på samme måde som add_tags_to_leads.",
      parameters: {
        type: "object",
        properties: {
          tags: { type: "array", items: { type: "string" }, description: "Tags der skal fjernes" },
          filter_industry: { type: "string", description: "Filtrer efter branche (valgfrit)" },
          filter_search: { type: "string", description: "Søg i leads (valgfrit)" },
          lead_ids: { type: "array", items: { type: "string" }, description: "Specifikke lead-IDs (valgfrit)" },
        },
        required: ["tags"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_lead_tags",
      description: "Vis alle eksisterende tags/mapper i lead-systemet med antal leads per tag.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "set_lead_industry",
      description: "Sæt branche/industri på leads. Gyldige værdier: craftsman (Håndværker), marketing, it_software (IT/Software), retail (Detailhandel), restaurant, legal_accounting (Advokat/Revisor), other (Anden).",
      parameters: {
        type: "object",
        properties: {
          industry: { type: "string", enum: ["craftsman", "marketing", "it_software", "retail", "restaurant", "legal_accounting", "other"], description: "Branche-værdi" },
          filter_search: { type: "string", description: "Søg i leads for at finde dem der skal opdateres (valgfrit)" },
          lead_ids: { type: "array", items: { type: "string" }, description: "Specifikke lead-IDs (valgfrit)" },
        },
        required: ["industry"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lead_status",
      description: "Opdater status på et eller flere leads. Gyldige statusser: new (Ny), contacted (Kontaktet), qualified (Kvalificeret), unqualified (Ukvalificeret), customer (Kunde). Kan filtrere leads efter branche, eksisterende status, søgeord, tags eller specifikke lead-IDs.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["new", "contacted", "qualified", "unqualified", "customer"], description: "Den nye status" },
          filter_industry: { type: "string", description: "Filtrer leads efter branche (valgfrit)" },
          filter_status: { type: "string", description: "Filtrer leads efter nuværende status (valgfrit)" },
          filter_search: { type: "string", description: "Søg i lead-navne/emails/virksomheder (valgfrit)" },
          filter_tags: { type: "array", items: { type: "string" }, description: "Filtrer leads der har disse tags (valgfrit)" },
          lead_ids: { type: "array", items: { type: "string" }, description: "Specifikke lead-IDs at opdatere (valgfrit)" },
        },
        required: ["status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_customers",
      description: "Søg i eksisterende kunder efter navn, email eller CVR.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Søgeterm" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_lead_folder",
      description: "Opret en ny mappe til at organisere leads i.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Mappens navn, f.eks. 'Restauranter' eller 'Varme leads'" },
          color: { type: "string", description: "Hex-farve for mappen, f.eks. '#3B82F6' (valgfrit)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_lead_folders",
      description: "Vis alle lead-mapper med antal leads i hver mappe.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "move_leads_to_folder",
      description: "Flyt leads til en bestemt mappe. Kan filtrere leads efter branche, status, søgeord, tags eller specifikke lead-IDs. Brug folder_name for at oprette eller finde mappen automatisk.",
      parameters: {
        type: "object",
        properties: {
          folder_name: { type: "string", description: "Navnet på mappen (oprettes automatisk hvis den ikke findes)" },
          folder_id: { type: "string", description: "Mappens ID (valgfrit – brug folder_name i stedet)" },
          filter_industry: { type: "string", description: "Filtrer leads efter branche (valgfrit)" },
          filter_status: { type: "string", description: "Filtrer leads efter status (valgfrit)" },
          filter_search: { type: "string", description: "Søg i lead-navne/emails/virksomheder (valgfrit)" },
          filter_tags: { type: "array", items: { type: "string" }, description: "Filtrer leads der har disse tags (valgfrit)" },
          lead_ids: { type: "array", items: { type: "string" }, description: "Specifikke lead-IDs at flytte (valgfrit)" },
        },
        required: ["folder_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_leads",
      description: "Slet leads permanent. Kan filtrere efter branche, status, søgeord, tags, mappe eller specifikke lead-IDs. ADVARSEL: Denne handling kan ikke fortrydes.",
      parameters: {
        type: "object",
        properties: {
          filter_industry: { type: "string", description: "Filtrer leads efter branche (valgfrit)" },
          filter_status: { type: "string", description: "Filtrer leads efter status (valgfrit)" },
          filter_search: { type: "string", description: "Søg i lead-navne/emails/virksomheder (valgfrit)" },
          filter_tags: { type: "array", items: { type: "string" }, description: "Filtrer leads der har disse tags (valgfrit)" },
          filter_folder_name: { type: "string", description: "Slet leads i en bestemt mappe (valgfrit)" },
          lead_ids: { type: "array", items: { type: "string" }, description: "Specifikke lead-IDs at slette (valgfrit)" },
          confirm: { type: "boolean", description: "Skal være true for at bekræfte sletning" },
        },
        required: ["confirm"],
      },
    },
  },
];

interface ToolArgs {
  to?: string;
  subject?: string;
  message?: string;
  cc?: string;
  receiver_email?: string;
  content?: string;
  cvr_number?: string;
  title?: string;
  description?: string;
  priority?: string;
  due_date?: string;
  name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  notes?: string;
  value?: number;
  start_time?: string;
  end_time?: string;
  query?: string;
  tags?: string[];
  filter_industry?: string;
  filter_status?: string;
  filter_search?: string;
  filter_tags?: string[];
  filter_folder_name?: string;
  lead_ids?: string[];
  industry?: string;
  status?: string;
  color?: string;
  folder_name?: string;
  folder_id?: string;
  confirm?: boolean;
}

// Tool execution functions
async function executeTool(
  toolName: string,
  args: ToolArgs,
  supabase: SupabaseClient,
  userId: string,
  companyId: string
): Promise<{ success: boolean; result: string }> {
  try {
    switch (toolName) {
      case "send_email": {
        // Never sends directly — creates a proposal in the same approval
        // queue autopilot_actions already uses (autopilot-agent's
        // propose_email), so a real human click in the UI is required
        // before gmail-send is ever called. See useExecuteAction().
        const { to, subject, message, cc } = args;
        const { error } = await supabase.from("autopilot_actions").insert({
          company_id: companyId,
          user_id: userId,
          action_id: crypto.randomUUID(),
          action_type: "send_email",
          category: "PA",
          headline: `Email → ${to}: ${subject}`,
          status: "proposed",
          rationale: "Foreslået af Personal PA — afventer din godkendelse.",
          payload: { to, subject, body: message, cc: cc || null },
          suggested_by: "smart-assistant",
        });
        if (error) return { success: false, result: `Kunne ikke oprette udkast: ${error.message}` };
        return {
          success: true,
          result: `📝 Udkast oprettet til ${to} med emne "${subject}". Emailen er IKKE sendt endnu — den venter på din godkendelse i handlingskøen.`,
        };
      }

      case "send_internal_message": {
        const { receiver_email, content } = args;
        const { data: receiver } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("email", receiver_email)
          .eq("company_id", companyId)
          .single();
        if (!receiver) return { success: false, result: `Kunne ikke finde bruger med email ${receiver_email} i virksomheden.` };
        const { error } = await supabase.from("messages").insert({
          company_id: companyId,
          sender_id: userId,
          receiver_id: receiver.user_id,
          content,
        });
        if (error) return { success: false, result: `Besked fejl: ${error.message}` };
        return { success: true, result: `✅ Intern besked sendt til ${receiver_email}` };
      }

      case "lookup_cvr": {
        const { cvr_number } = args;
        const clean = cvr_number.replace(/\D/g, "");
        if (clean.length !== 8) return { success: false, result: "CVR-nummeret skal være 8 cifre." };
        // Use vatcomply for lookup
        const resp = await fetch(`https://api.vatcomply.com/vat?vat_number=DK${clean}`);
        if (!resp.ok) return { success: false, result: "Kunne ikke slå CVR op. Prøv igen." };
        const data = await resp.json();
        if (!data.valid) return { success: false, result: `CVR DK${clean} er ikke gyldigt.` };
        return {
          success: true,
          result: `🏢 **${data.name}**\n📍 ${data.address}\nCVR: DK${clean}\nStatus: ${data.valid ? "Aktiv" : "Inaktiv"}`,
        };
      }

      case "create_task": {
        const { title, description, priority, due_date } = args;
        const { data, error } = await supabase.from("tasks").insert({
          company_id: companyId,
          created_by: userId,
          title,
          description: description || null,
          priority: priority || "medium",
          due_date: due_date || null,
        }).select("id").single();
        if (error) return { success: false, result: `Opgave fejl: ${error.message}` };
        return { success: true, result: `✅ Opgave oprettet: "${title}"${due_date ? ` (deadline: ${due_date})` : ""}` };
      }

      case "create_lead": {
        const { name, email, phone, company_name, notes, value } = args;
        const { error } = await supabase.from("customers").insert({
          company_id: companyId,
          created_by: userId,
          name,
          email,
          phone: phone || null,
          company_name: company_name || null,
          notes: notes || null,
          value: value || 0,
          record_type: "lead",
        });
        if (error) return { success: false, result: `Lead fejl: ${error.message}` };
        return { success: true, result: `✅ Lead oprettet: "${name}" (${email})${company_name ? ` fra ${company_name}` : ""}` };
      }

      case "create_calendar_event": {
        const { title, description, start_time, end_time } = args;
        const { error } = await supabase.from("calendar_events").insert({
          company_id: companyId,
          created_by: userId,
          title,
          description: description || null,
          start_time,
          end_time,
        });
        if (error) return { success: false, result: `Kalender fejl: ${error.message}` };
        return { success: true, result: `✅ Begivenhed oprettet: "${title}" (${new Date(start_time).toLocaleString("da-DK")})` };
      }

      case "search_leads": {
        const { query } = args;
        const q = `%${query}%`;
        const { data: leads } = await supabase
          .from("customers")
          .select("id, name, email, company_name, status, score, value, tags, industry")
          .eq("company_id", companyId)
          .eq("record_type", "lead")
          .or(`name.ilike.${q},email.ilike.${q},company_name.ilike.${q}`)
          .limit(10);
        if (!leads?.length) return { success: true, result: `Ingen leads fundet for "${query}".` };
        const list = leads.map((l: { name: string; email: string; id: string; company_name?: string; score?: number; status?: string; tags?: string[]; industry?: string }) => `- **${l.name}** (${l.email}, ID: ${l.id}) – ${l.company_name || "Ingen virksomhed"}, score: ${l.score}, status: ${l.status}, tags: ${(l.tags || []).join(", ") || "ingen"}, branche: ${l.industry || "ikke sat"}`).join("\n");
        return { success: true, result: `Fandt ${leads.length} leads:\n${list}` };
      }

      case "add_tags_to_leads": {
        const { tags, filter_industry, filter_status, filter_search, lead_ids } = args;
        if (!tags?.length) return { success: false, result: "Ingen tags angivet." };

        // Build query to find leads
        let query = supabase.from("customers").select("id, name, tags").eq("company_id", companyId).eq("record_type", "lead");
        if (lead_ids?.length) {
          query = query.in("id", lead_ids);
        } else {
          if (filter_industry) query = query.eq("industry", filter_industry);
          if (filter_status) query = query.eq("status", filter_status);
          if (filter_search) {
            const q = `%${filter_search}%`;
            query = query.or(`name.ilike.${q},email.ilike.${q},company_name.ilike.${q}`);
          }
        }
        query = query.limit(200);

        const { data: leads, error: fetchErr } = await query;
        if (fetchErr) return { success: false, result: `Fejl: ${fetchErr.message}` };
        if (!leads?.length) return { success: false, result: "Ingen leads fundet med de angivne filtre." };

        let updated = 0;
        for (const lead of leads) {
          const existing: string[] = lead.tags || [];
          const merged = [...new Set([...existing, ...tags])];
          if (merged.length !== existing.length) {
            const { error } = await supabase.from("customers").update({ tags: merged }).eq("id", lead.id);
            if (!error) updated++;
          }
        }
        return { success: true, result: `✅ Tags [${tags.join(", ")}] tilføjet til ${updated} leads (ud af ${leads.length} fundet).` };
      }

      case "remove_tags_from_leads": {
        const { tags, filter_industry, filter_search, lead_ids } = args;
        if (!tags?.length) return { success: false, result: "Ingen tags angivet." };

        let query = supabase.from("customers").select("id, name, tags").eq("company_id", companyId).eq("record_type", "lead");
        if (lead_ids?.length) {
          query = query.in("id", lead_ids);
        } else {
          if (filter_industry) query = query.eq("industry", filter_industry);
          if (filter_search) {
            const q = `%${filter_search}%`;
            query = query.or(`name.ilike.${q},email.ilike.${q},company_name.ilike.${q}`);
          }
        }
        // Only get leads that actually have these tags
        query = query.overlaps("tags", tags).limit(200);

        const { data: leads, error: fetchErr } = await query;
        if (fetchErr) return { success: false, result: `Fejl: ${fetchErr.message}` };
        if (!leads?.length) return { success: true, result: "Ingen leads med de angivne tags fundet." };

        let updated = 0;
        for (const lead of leads) {
          const remaining = (lead.tags || []).filter((t: string) => !tags.includes(t));
          const { error } = await supabase.from("customers").update({ tags: remaining.length ? remaining : null }).eq("id", lead.id);
          if (!error) updated++;
        }
        return { success: true, result: `✅ Tags [${tags.join(", ")}] fjernet fra ${updated} leads.` };
      }

      case "list_lead_tags": {
        const { data: leads } = await supabase
          .from("customers")
          .select("tags")
          .eq("company_id", companyId)
          .eq("record_type", "lead")
          .not("tags", "is", null);

        const tagCounts: Record<string, number> = {};
        (leads || []).forEach((l: { tags?: string[] }) => {
          if (Array.isArray(l.tags)) {
            l.tags.forEach((t: string) => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
          }
        });

        const tagList = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
        if (!tagList.length) return { success: true, result: "Der er ingen tags/mapper i systemet endnu. Brug 'add_tags_to_leads' for at oprette nye." };

        const formatted = tagList.map(([tag, count]) => `- **${tag}**: ${count} leads`).join("\n");
        return { success: true, result: `📂 Tags/mapper i systemet:\n${formatted}` };
      }

      case "set_lead_industry": {
        const { industry, filter_search, lead_ids } = args;
        const validIndustries = ["craftsman", "marketing", "it_software", "retail", "restaurant", "legal_accounting", "other"];
        if (!validIndustries.includes(industry)) return { success: false, result: `Ugyldig branche. Gyldige: ${validIndustries.join(", ")}` };

        let query = supabase.from("customers").select("id").eq("company_id", companyId).eq("record_type", "lead");
        if (lead_ids?.length) {
          query = query.in("id", lead_ids);
        } else if (filter_search) {
          const q = `%${filter_search}%`;
          query = query.or(`name.ilike.${q},email.ilike.${q},company_name.ilike.${q}`);
        } else {
          return { success: false, result: "Angiv enten lead_ids eller filter_search for at vælge leads." };
        }
        query = query.limit(200);

        const { data: leads, error: fetchErr } = await query;
        if (fetchErr) return { success: false, result: `Fejl: ${fetchErr.message}` };
        if (!leads?.length) return { success: false, result: "Ingen leads fundet." };

        const industryLabels: Record<string, string> = { craftsman: "Håndværker", marketing: "Marketing", it_software: "IT/Software", retail: "Detailhandel", restaurant: "Restaurant", legal_accounting: "Advokat/Revisor", other: "Anden" };
        let updated = 0;
        for (const lead of leads) {
          const { error } = await supabase.from("customers").update({ industry }).eq("id", lead.id);
          if (!error) updated++;
        }
        return { success: true, result: `✅ Branche sat til "${industryLabels[industry]}" på ${updated} leads.` };
      }

      case "update_lead_status": {
        const { status, filter_industry, filter_status, filter_search, filter_tags, lead_ids } = args;
        const validStatuses = ["new", "contacted", "qualified", "unqualified", "customer"];
        if (!validStatuses.includes(status)) return { success: false, result: `Ugyldig status. Gyldige: ${validStatuses.join(", ")}` };

        let query = supabase.from("customers").select("id, name").eq("company_id", companyId).eq("record_type", "lead");
        if (lead_ids?.length) {
          query = query.in("id", lead_ids);
        } else {
          if (filter_industry) query = query.eq("industry", filter_industry);
          if (filter_status) query = query.eq("status", filter_status);
          if (filter_search) {
            const q = `%${filter_search}%`;
            query = query.or(`name.ilike.${q},email.ilike.${q},company_name.ilike.${q}`);
          }
          if (filter_tags?.length) query = query.overlaps("tags", filter_tags);
        }
        query = query.limit(200);

        const { data: leads, error: fetchErr } = await query;
        if (fetchErr) return { success: false, result: `Fejl: ${fetchErr.message}` };
        if (!leads?.length) return { success: false, result: "Ingen leads fundet med de angivne filtre." };

        const statusLabels: Record<string, string> = { new: "Ny", contacted: "Kontaktet", qualified: "Kvalificeret", unqualified: "Ukvalificeret", customer: "Kunde" };
        let updated = 0;
        for (const lead of leads) {
          const { error } = await supabase.from("customers").update({ status }).eq("id", lead.id);
          if (!error) updated++;
        }
        return { success: true, result: `✅ Status opdateret til **${statusLabels[status]}** for ${updated} leads (ud af ${leads.length} fundet).` };
      }

      case "search_customers": {
        const { query } = args;
        const q = `%${query}%`;
        const { data: customers } = await supabase
          .from("customers")
          .select("name, email, phone, vat_number, address")
          .eq("company_id", companyId)
          .eq("record_type", "customer")
          .or(`name.ilike.${q},email.ilike.${q},vat_number.ilike.${q}`)
          .limit(10);
        if (!customers?.length) return { success: true, result: `Ingen kunder fundet for "${query}".` };
        const list = customers.map((c: { name: string; email: string; vat_number?: string; address?: string }) => `- **${c.name}** (${c.email}) – CVR: ${c.vat_number || "N/A"}, ${c.address || ""}`).join("\n");
        return { success: true, result: `Fandt ${customers.length} kunder:\n${list}` };
      }

      case "create_lead_folder": {
        const { name, color } = args;
        const { data, error } = await supabase.from("lead_folders").insert({
          company_id: companyId,
          created_by: userId,
          name,
          color: color || "#3B82F6",
        }).select("id, name").single();
        if (error) return { success: false, result: `Mappe fejl: ${error.message}` };
        return { success: true, result: `✅ Mappe oprettet: "${data.name}" (ID: ${data.id})` };
      }

      case "list_lead_folders": {
        const { data: folders } = await supabase
          .from("lead_folders")
          .select("id, name, color")
          .eq("company_id", companyId)
          .order("created_at");
        if (!folders?.length) return { success: true, result: "Der er ingen mapper endnu. Brug 'create_lead_folder' for at oprette en." };

        // Count leads per folder
        const { data: leads } = await supabase
          .from("customers")
          .select("folder_id")
          .eq("company_id", companyId)
          .eq("record_type", "lead")
          .not("folder_id", "is", null);

        const folderCounts: Record<string, number> = {};
        (leads || []).forEach((l: { folder_id?: string }) => { folderCounts[l.folder_id] = (folderCounts[l.folder_id] || 0) + 1; });

        const formatted = folders.map((f: { name: string; id: string }) => `- 📁 **${f.name}** (ID: ${f.id}): ${folderCounts[f.id] || 0} leads`).join("\n");
        return { success: true, result: `📂 Lead-mapper:\n${formatted}` };
      }

      case "move_leads_to_folder": {
        const { folder_name, folder_id: inputFolderId, filter_industry, filter_status, filter_search, filter_tags, lead_ids } = args;

        // Find or create folder
        let targetFolderId = inputFolderId;
        if (!targetFolderId && folder_name) {
          const { data: existing } = await supabase
            .from("lead_folders")
            .select("id")
            .eq("company_id", companyId)
            .ilike("name", folder_name)
            .limit(1);
          if (existing?.length) {
            targetFolderId = existing[0].id;
          } else {
            const { data: created, error: createErr } = await supabase
              .from("lead_folders")
              .insert({ company_id: companyId, created_by: userId, name: folder_name })
              .select("id")
              .single();
            if (createErr) return { success: false, result: `Kunne ikke oprette mappe: ${createErr.message}` };
            targetFolderId = created.id;
          }
        }
        if (!targetFolderId) return { success: false, result: "Ingen mappe angivet." };

        // Find leads to move
        let query = supabase.from("customers").select("id, name").eq("company_id", companyId).eq("record_type", "lead");
        if (lead_ids?.length) {
          query = query.in("id", lead_ids);
        } else {
          if (filter_industry) query = query.eq("industry", filter_industry);
          if (filter_status) query = query.eq("status", filter_status);
          if (filter_search) {
            const q = `%${filter_search}%`;
            query = query.or(`name.ilike.${q},email.ilike.${q},company_name.ilike.${q}`);
          }
          if (filter_tags?.length) query = query.overlaps("tags", filter_tags);
        }
        query = query.limit(500);

        const { data: leads, error: fetchErr } = await query;
        if (fetchErr) return { success: false, result: `Fejl: ${fetchErr.message}` };
        if (!leads?.length) return { success: false, result: "Ingen leads fundet med de angivne filtre." };

        let moved = 0;
        for (const lead of leads) {
          const { error } = await supabase.from("customers").update({ folder_id: targetFolderId }).eq("id", lead.id);
          if (!error) moved++;
        }
        return { success: true, result: `✅ ${moved} leads flyttet til mappen "${folder_name || "valgt mappe"}" (ud af ${leads.length} fundet).` };
      }

      case "delete_leads": {
        const { filter_industry, filter_status, filter_search, filter_tags, filter_folder_name, lead_ids, confirm } = args;
        if (!confirm) return { success: false, result: "⚠️ Sletning kræver bekræftelse. Sæt confirm=true for at slette." };

        // Find leads to delete
        let query = supabase.from("customers").select("id, name").eq("company_id", companyId).eq("record_type", "lead");
        if (lead_ids?.length) {
          query = query.in("id", lead_ids);
        } else {
          if (filter_industry) query = query.eq("industry", filter_industry);
          if (filter_status) query = query.eq("status", filter_status);
          if (filter_search) {
            const q = `%${filter_search}%`;
            query = query.or(`name.ilike.${q},email.ilike.${q},company_name.ilike.${q}`);
          }
          if (filter_tags?.length) query = query.overlaps("tags", filter_tags);
          if (filter_folder_name) {
            const { data: folder } = await supabase
              .from("lead_folders")
              .select("id")
              .eq("company_id", companyId)
              .ilike("name", filter_folder_name)
              .limit(1);
            if (folder?.length) query = query.eq("folder_id", folder[0].id);
            else return { success: false, result: `Mappe "${filter_folder_name}" ikke fundet.` };
          }
        }
        query = query.limit(500);

        const { data: leads, error: fetchErr } = await query;
        if (fetchErr) return { success: false, result: `Fejl: ${fetchErr.message}` };
        if (!leads?.length) return { success: false, result: "Ingen leads fundet med de angivne filtre." };

        let deleted = 0;
        for (const lead of leads) {
          const { error } = await supabase.from("customers").delete().eq("id", lead.id);
          if (!error) deleted++;
        }
        return { success: true, result: `🗑️ ${deleted} leads slettet permanent (ud af ${leads.length} fundet).` };
      }

      default:
        return { success: false, result: `Ukendt værktøj: ${toolName}` };
    }
  } catch (e) {
    console.error(`Tool ${toolName} error:`, e);
    return { success: false, result: `Fejl ved ${toolName}: ${e instanceof Error ? e.message : "Ukendt fejl"}` };
  }
}

function detectContext(path: string): string {
  if (path.includes("meta-ads")) return "meta-ads";
  for (const key of Object.keys(CONTEXT_PROMPTS)) {
    if (path.includes(key)) return key;
  }
  return "dashboard";
}

async function fetchContextData(supabase: SupabaseClient, context: string, companyId: string): Promise<string> {
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const parts: string[] = [];

  try {
    const { data: urgentTasks } = await supabase
      .from("tasks")
      .select("title, due_date, status, priority")
      .eq("company_id", companyId)
      .neq("status", "completed")
      .not("due_date", "is", null)
      .lte("due_date", in7Days.toISOString().split("T")[0])
      .order("due_date")
      .limit(10);
    if (urgentTasks?.length) {
      parts.push("**Opgaver med deadline inden 7 dage:**\n" + urgentTasks.map((t: { title: string; due_date?: string; priority?: string; status?: string }) => `- ${t.title} (${t.due_date}, prioritet: ${t.priority}, status: ${t.status})`).join("\n"));
    }

    const { data: urgentDeals } = await supabase
      .from("deals")
      .select("title, value, stage, expected_close_date")
      .eq("company_id", companyId)
      .not("expected_close_date", "is", null)
      .lte("expected_close_date", in7Days.toISOString().split("T")[0])
      .not("stage", "in", "(won,lost)")
      .order("expected_close_date")
      .limit(10);
    if (urgentDeals?.length) {
      parts.push("**Deals med forventet lukning inden 7 dage:**\n" + urgentDeals.map((d: { title: string; value?: number; stage?: string; expected_close_date?: string }) => `- ${d.title}: ${d.value} DKK (${d.stage}, lukker: ${d.expected_close_date})`).join("\n"));
    }

    if (context === "leads") {
      const { data: leads } = await supabase
        .from("customers")
        .select("name, status, score, value, next_followup_at, email")
        .eq("company_id", companyId)
        .eq("record_type", "lead")
        .order("score", { ascending: false })
        .limit(15);
      if (leads?.length) {
        parts.push("**Aktuelle leads (top 15):**\n" + leads.map((l: { name: string; email: string; score?: number; status?: string }) => `- ${l.name} (${l.email}): score ${l.score}, status: ${l.status}`).join("\n"));
      }
    }

    if (context === "deals" || context === "pipeline") {
      const { data: deals } = await supabase
        .from("deals")
        .select("title, value, stage, expected_close_date")
        .eq("company_id", companyId)
        .not("stage", "in", "(won,lost)")
        .order("value", { ascending: false })
        .limit(15);
      if (deals?.length) {
        parts.push("**Aktive deals:**\n" + deals.map((d: { title: string; value?: number; stage?: string }) => `- ${d.title}: ${d.value} DKK, stage: ${d.stage}`).join("\n"));
      }
    }
  } catch (e) {
    console.error("Context data fetch error:", e);
  }

  return parts.length ? "\n\n--- LIVE DATA FRA SYSTEMET ---\n" + parts.join("\n\n") : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, pageContext, pageSnapshot } = await req.json();

    const context = detectContext(pageContext || "");
    const contextPrompt = CONTEXT_PROMPTS[context] || CONTEXT_PROMPTS.dashboard;

    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let contextData = "";
    let userId = "";
    let companyId = "";
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (user) {
      userId = user.id;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, full_name")
        .eq("user_id", user.id)
        .single();
      if (profile?.company_id) {
        companyId = profile.company_id;
        contextData = await fetchContextData(supabase, context, companyId);
      }
    }

    if (!companyId) throw new Error("Ingen virksomhed tilknyttet");
    const ai = await getCompanyAI(supabase, companyId);
    if (!ai) throw new Error(AI_NOT_CONNECTED_MESSAGE);

    // Include page snapshot if available (only sent when PA is open)
    const pageSnapshotSection = pageSnapshot
      ? `\n\n--- HVAD BRUGEREN SER PÅ SKÆRMEN LIGE NU ---\nDu kan se præcis hvad brugeren ser på deres skærm. Brug dette til at give specifik, kontekstualiseret hjælp.\n${pageSnapshot}\n--- SLUT PÅ SKÆRM-SNAPSHOT ---`
      : "";

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const currentYear = today.getFullYear();

    const systemPrompt = `Du er brugerens personlige PA (personlig assistent) – integreret i et dansk CRM/ERP-system.

DAGENS DATO: ${todayStr} (år ${currentYear}). Brug ALTID dette årstal ved relative datoer som "i morgen", "næste uge", "om en måned" osv.

${contextPrompt}

DEN VIGTIGSTE REGEL: **LÆS brugerens besked GRUNDIGT.** Følg ALTID instruktioner om format og længde.

DU KAN SE BRUGERENS SKÆRM: Når brugeren har dig åben, scanner du deres aktuelle side og kan se alt indhold – tabeller, KPI'er, formularer, emails osv. Brug denne viden PROAKTIVT til at hjælpe.

KONTEKST-BEVIDST HJÆLP:
- Hvis brugeren er på Meta Ads: Hjælp med kampagneoptimering, budgetforslag, målgruppe-anbefalinger baseret på hvad du ser.
- Hvis brugeren læser en email: Foreslå svar, opsummer indhold, identificér handlinger.
- Hvis brugeren ser på leads: Analysér scoring, foreslå opfølgning, prioritér leads.
- Giv ALTID specifikke forslag baseret på de data du kan se – ikke generelle råd.

DU HAR ADGANG TIL VÆRKTØJER:
- **send_email**: Opretter et udkast til handlingskøen — sender ALDRIG direkte. Brugeren skal selv godkende udkastet med et klik, før det bliver sendt.
- **send_internal_message**: Send intern besked til en kollega.
- **lookup_cvr**: Slå dansk virksomhed op via CVR-nummer.
- **create_task**: Opret opgaver i systemet.
- **create_lead**: Opret nye leads.
- **create_calendar_event**: Opret møder og begivenheder.
- **search_leads**: Søg i leads (viser også ID, tags og branche).
- **search_customers**: Søg i kunder.
- **add_tags_to_leads**: Tilføj tags/mapper til leads. Kan filtrere på branche, status eller søgning. Brug dette til at organisere leads i mapper!
- **remove_tags_from_leads**: Fjern tags fra leads.
- **list_lead_tags**: Vis alle tags/mapper og antal leads per tag.
- **set_lead_industry**: Sæt branche på leads (Håndværker, Marketing, IT/Software, Detailhandel, Restaurant, Advokat/Revisor, Anden).
- **create_lead_folder**: Opret en ny mappe til at organisere leads.
- **list_lead_folders**: Vis alle lead-mapper med antal leads.
- **move_leads_to_folder**: Flyt leads til en mappe (opretter mappen automatisk hvis den ikke findes). Kan filtrere på branche, status, søgning, tags.
- **delete_leads**: Slet leads permanent. Kan filtrere på branche, status, søgning, tags, mappe eller specifikke IDs. Kræver confirm=true.

MAPPER-STRATEGI:
- Når brugeren beder om at organisere leads i mapper, brug 'list_lead_folders' først for at se eksisterende mapper.
- Brug 'move_leads_to_folder' til at flytte leads – mappen oprettes automatisk hvis den ikke findes.
- Når brugeren beder om at slette leads, brug 'delete_leads' med confirm=true. Bekræft ALTID med brugeren FØRST hvad der slettes.
- 'send_email' opretter ALTID kun et udkast i handlingskøen — den sender aldrig noget selv. Fortæl brugeren at emailen afventer deres godkendelse; påstå ALDRIG at en email er "sendt". Opfind aldrig selv en email at sende — brug kun 'send_email' når brugeren eksplicit har bedt om at sende netop denne email.

VIGTIGE REGLER FOR VÆRKTØJER:
1. Brug værktøjer PROAKTIVT når det giver mening.
2. Bekræft kort hvad du gjorde.
3. Du MÅ gerne udføre flere handlinger i træk.
4. Spørg kun om manglende NØDVENDIG information.
5. Når du opretter tasks med deadline, brug ALTID ${currentYear} eller senere – ALDRIG et år i fortiden.

ØVRIGE REGLER:
1. Hold svar korte og præcise. Maks 3-5 sætninger medmindre brugeren beder om mere.
2. Brug live data til konkrete svar.
3. Svar ALTID på dansk medmindre brugeren skriver på andet sprog.
4. Vær konkret – giv specifikke forslag, ikke generelle råd.
${contextData}${pageSnapshotSection}`;

    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Tool-calling loop (non-streaming to handle tools, then stream final response)
    const MAX_TOOL_ROUNDS = 5;
    let toolRound = 0;
    const toolResults: string[] = [];

    while (toolRound < MAX_TOOL_ROUNDS) {
      const toolResponse = await fetch(ai.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ai.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ai.model,
          messages: aiMessages,
          tools,
          tool_choice: "auto",
          stream: false,
        }),
      });

      if (!toolResponse.ok) {
        const { status, message } = await describeOpenAIError(toolResponse);
        console.error("AI gateway error:", status, message);
        return new Response(JSON.stringify({ error: message }), {
          status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const toolData = await toolResponse.json();
      const choice = toolData.choices?.[0];
      if (!choice) break;

      const assistantMsg = choice.message;
      aiMessages.push(assistantMsg);

      // If no tool calls, we have the final answer — break and stream it
      if (!assistantMsg.tool_calls?.length) {
        // Return the content directly as SSE
        const finalContent = assistantMsg.content || "";
        // Prepend tool results if any
        const fullContent = toolResults.length
          ? toolResults.join("\n") + "\n\n" + finalContent
          : finalContent;

        // Stream it as SSE for consistent frontend handling
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            // Send as one chunk
            const chunk = JSON.stringify({
              choices: [{ delta: { content: fullContent } }],
            });
            controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      // Execute tool calls
      for (const toolCall of assistantMsg.tool_calls) {
        const fn = toolCall.function;
        let args: ToolArgs = {};
        try {
          args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments;
        } catch { args = {}; }

        console.log(`Executing tool: ${fn.name}`, args);
        const result = await executeTool(fn.name, args, supabase, userId, companyId);
        toolResults.push(result.result);

        aiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.result,
        });
      }

      toolRound++;
    }

    // Fallback: stream final response after tool rounds exhausted
    const finalResponse = await fetch(ai.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ai.model,
        messages: aiMessages,
        stream: true,
      }),
    });

    if (!finalResponse.ok) {
      const { status, message } = await describeOpenAIError(finalResponse);
      console.error("Final stream error:", status, message);
      return new Response(JSON.stringify({ error: message }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prepend tool results to the stream
    if (toolResults.length) {
      const encoder = new TextEncoder();
      const toolPrefix = toolResults.join("\n") + "\n\n";
      const prefixChunk = `data: ${JSON.stringify({ choices: [{ delta: { content: toolPrefix } }] })}\n\n`;

      const originalBody = finalResponse.body!;
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(prefixChunk));
          const reader = originalBody.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    return new Response(finalResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("smart-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Ukendt fejl" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
