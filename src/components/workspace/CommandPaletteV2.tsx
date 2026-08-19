import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isLocale } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { DESTINATIONS, PINNED, MODES } from "./modes";
import { Building2, Briefcase, FileText, Target, ArrowRight } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function CommandPaletteV2({ open, onOpenChange }: Props) {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${locale}/app`;
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  // Global keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  // Entity search (lazy — only when there's a query)
  const { data: entities } = useQuery({
    queryKey: ["palette-entities", query],
    enabled: open && query.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const q = `%${query}%`;
      const [customers, deals, leads, invoices] = await Promise.all([
        supabase.from("customers").select("id,name,email").ilike("name", q).limit(5),
        supabase.from("deals").select("id,title,customer_id").ilike("title", q).limit(5),
        supabase.from("leads").select("id,name,email").ilike("name", q).limit(5),
        supabase.from("invoices").select("id,invoice_number,amount,customer_id").ilike("invoice_number", q).limit(5),
      ]);
      return {
        customers: customers.data ?? [],
        deals: deals.data ?? [],
        leads: leads.data ?? [],
        invoices: invoices.data ?? [],
      };
    },
  });

  const allDestinations = useMemo(() => {
    const seen = new Set<string>();
    return [...DESTINATIONS, ...PINNED].filter(d => {
      if (seen.has(d.path)) return false;
      seen.add(d.path);
      return true;
    });
  }, []);

  // cmdk's default fuzzy scorer matches on loose subsequences (e.g. "test"
  // matches "Tidsregistr." because t-e-s-t appears in order), which produces
  // irrelevant top results. Use plain substring matching instead.
  const q = query.trim().toLowerCase();
  const filteredDestinations = useMemo(
    () => (q ? allDestinations.filter(d => d.label.toLowerCase().includes(q)) : allDestinations),
    [allDestinations, q],
  );
  const filteredModes = useMemo(
    () => (q ? MODES.filter(m => m.label.toLowerCase().includes(q) || m.hint.toLowerCase().includes(q)) : MODES),
    [q],
  );

  const go = (path: string) => {
    onOpenChange(false);
    setQuery("");
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Søg klienter, deals, fakturaer eller naviger…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[480px]">
        <CommandEmpty>Ingen resultater.</CommandEmpty>

        {entities && (entities.customers.length + entities.deals.length + entities.leads.length + entities.invoices.length) > 0 && (
          <>
            {entities.customers.length > 0 && (
              <CommandGroup heading="Klienter">
                {entities.customers.map(c => (
                  <CommandItem key={c.id} value={`klient ${c.name} ${c.email}`} onSelect={() => go(`${base}/clients/${c.id}`)} className="gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground truncate">{c.email}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {entities.deals.length > 0 && (
              <CommandGroup heading="Deals">
                {entities.deals.map(d => (
                  <CommandItem key={d.id} value={`deal ${d.title}`} onSelect={() => go(d.customer_id ? `${base}/clients/${d.customer_id}` : `${base}/crm/deals`)} className="gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{d.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {entities.leads.length > 0 && (
              <CommandGroup heading="Leads">
                {entities.leads.map(l => (
                  <CommandItem key={l.id} value={`lead ${l.name} ${l.email}`} onSelect={() => go(`${base}/crm/leads`)} className="gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{l.name}</span>
                    <span className="text-xs text-muted-foreground truncate">{l.email}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {entities.invoices.length > 0 && (
              <CommandGroup heading="Fakturaer">
                {entities.invoices.map(i => (
                  <CommandItem key={i.id} value={`faktura ${i.invoice_number}`} onSelect={() => go(i.customer_id ? `${base}/clients/${i.customer_id}` : `${base}/finance/invoices`)} className="gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">#{i.invoice_number}</span>
                    <span className="text-xs text-muted-foreground">{Number(i.amount).toLocaleString("da-DK")}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Modes">
          {filteredModes.map(m => (
            <CommandItem key={m.id} value={`mode ${m.label} ${m.hint}`} onSelect={() => go(`${base}/dashboard`)} className="gap-2">
              <m.icon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">{m.label}</span>
              <span className="text-xs text-muted-foreground">{m.hint}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Naviger">
          {filteredDestinations.map(d => (
            <CommandItem key={d.path} value={`naviger ${d.label}`} onSelect={() => go(`${base}/${d.path}`)} className="gap-2">
              <d.icon className="h-4 w-4 text-muted-foreground" />
              <span>{d.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
