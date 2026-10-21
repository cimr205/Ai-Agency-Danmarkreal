import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isLocale, useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { DESTINATIONS, PINNED, MODES } from "./modes";
import { Building2, Briefcase, FileText, Target, ArrowRight } from "lucide-react";
import { useMyBlockedModules, pathToModule } from "@/hooks/api/useModuleAccess";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function CommandPaletteV2({ open, onOpenChange }: Props) {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";
  const base = `/${locale}/app`;
  const navigate = useNavigate();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const blockedModules = useMyBlockedModules();

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
        supabase.from("customers").select("id,name,email").eq("record_type", "customer").ilike("name", q).limit(5),
        supabase.from("deals").select("id,title,customer_id").ilike("title", q).limit(5),
        supabase.from("customers").select("id,name,email").eq("record_type", "lead").ilike("name", q).limit(5),
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
      // Keep the palette consistent with the sidebar and route guard —
      // otherwise a restricted employee can still find and briefly
      // navigate into a blocked module via search.
      const module = pathToModule(d.path);
      if (module && blockedModules.has(module)) return false;
      return true;
    });
  }, [blockedModules]);

  // cmdk's default fuzzy scorer matches on loose subsequences (e.g. "test"
  // matches "Tidsregistr." because t-e-s-t appears in order), which produces
  // irrelevant top results. Use plain substring matching instead.
  const q = query.trim().toLowerCase();
  const filteredDestinations = useMemo(
    () => (q ? allDestinations.filter(d => t(d.labelKey).toLowerCase().includes(q)) : allDestinations),
    [allDestinations, q, t],
  );
  const filteredModes = useMemo(
    () => (q ? MODES.filter(m => t(m.labelKey).toLowerCase().includes(q) || t(m.hintKey).toLowerCase().includes(q)) : MODES),
    [q, t],
  );

  const go = (path: string) => {
    onOpenChange(false);
    setQuery("");
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder={t('command.searchPlaceholderV2')}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[480px]">
        <CommandEmpty>{t('command.noResultsV2')}</CommandEmpty>

        {entities && (entities.customers.length + entities.deals.length + entities.leads.length + entities.invoices.length) > 0 && (
          <>
            {entities.customers.length > 0 && (
              <CommandGroup heading={t('nav.clients')}>
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
              <CommandGroup heading={t('nav.deals')}>
                {entities.deals.map(d => (
                  <CommandItem key={d.id} value={`deal ${d.title}`} onSelect={() => go(d.customer_id ? `${base}/clients/${d.customer_id}` : `${base}/crm/deals`)} className="gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{d.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {entities.leads.length > 0 && (
              <CommandGroup heading={t('nav.leads')}>
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
              <CommandGroup heading={t('nav.invoices')}>
                {entities.invoices.map(i => (
                  <CommandItem key={i.id} value={`faktura ${i.invoice_number}`} onSelect={() => go(i.customer_id ? `${base}/clients/${i.customer_id}` : `${base}/finance/invoices`)} className="gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">#{i.invoice_number}</span>
                    <span className="text-xs text-muted-foreground">{Number(i.amount).toLocaleString(locale === 'da' ? 'da-DK' : locale === 'de' ? 'de-DE' : 'en-US')}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading={t('command.switchMode')}>
          {filteredModes.map(m => (
            <CommandItem key={m.id} value={`mode ${t(m.labelKey)} ${t(m.hintKey)}`} onSelect={() => go(`${base}/dashboard`)} className="gap-2">
              <m.icon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">{t(m.labelKey)}</span>
              <span className="text-xs text-muted-foreground">{t(m.hintKey)}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t('command.goTo')}>
          {filteredDestinations.map(d => (
            <CommandItem key={d.path} value={`naviger ${t(d.labelKey)}`} onSelect={() => go(`${base}/${d.path}`)} className="gap-2">
              <d.icon className="h-4 w-4 text-muted-foreground" />
              <span>{t(d.labelKey)}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
