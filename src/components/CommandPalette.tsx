import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut,
} from '@/components/ui/command';
import {
  User, Briefcase, FileText, ClipboardList, UserCheck, LayoutDashboard, Target,
  Megaphone, Mail, Calendar, Wallet, CreditCard, Users, Settings, Bot,
} from 'lucide-react';
import { useI18n, isLocale } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';

export const OPEN_COMMAND_PALETTE_EVENT = 'open-command-palette';

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

type Hit = {
  id: string;
  group: 'leads' | 'customers' | 'deals' | 'tasks' | 'invoices' | 'employees';
  title: string;
  subtitle?: string;
  url: string;
  icon: typeof User;
};

export default function CommandPalette() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const base = `/${locale}/app`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener('keydown', onKeydown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (!open) { setQuery(''); setHits([]); }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const like = `%${q}%`;
      const [leads, customers, deals, tasks, invoices, employees] = await Promise.all([
        supabase.from('customers').select('id, name, company_name, email')
          .eq('record_type', 'lead')
          .or(`name.ilike.${like},company_name.ilike.${like},email.ilike.${like}`).limit(5),
        supabase.from('customers').select('id, name, company_name, email')
          .eq('record_type', 'customer')
          .or(`name.ilike.${like},company_name.ilike.${like},email.ilike.${like}`).limit(5),
        supabase.from('deals').select('id, title, value').ilike('title', like).limit(5),
        supabase.from('tasks').select('id, title').eq('archived', false).ilike('title', like).limit(5),
        supabase.from('invoices').select('id, invoice_number').ilike('invoice_number', like).limit(5),
        supabase.from('employee_profiles').select('id, full_name, position')
          .or(`full_name.ilike.${like},position.ilike.${like}`).limit(5),
      ]);
      if (cancelled) return;

      const next: Hit[] = [];
      leads.data?.forEach((r) => next.push({
        id: r.id, group: 'leads', icon: User, title: r.name, subtitle: r.company_name || r.email || undefined,
        url: `${base}/crm/leads?leadId=${r.id}`,
      }));
      customers.data?.forEach((r) => next.push({
        id: r.id, group: 'customers', icon: Users, title: r.name, subtitle: r.company_name || r.email || undefined,
        url: `${base}/clients/${r.id}`,
      }));
      deals.data?.forEach((r) => next.push({
        id: r.id, group: 'deals', icon: Briefcase, title: r.title,
        url: `${base}/crm/deals?dealId=${r.id}`,
      }));
      tasks.data?.forEach((r) => next.push({
        id: r.id, group: 'tasks', icon: ClipboardList, title: r.title,
        url: `${base}/work/tasks`,
      }));
      invoices.data?.forEach((r) => next.push({
        id: r.id, group: 'invoices', icon: FileText, title: r.invoice_number,
        url: `${base}/finance/invoices?invoiceId=${r.id}`,
      }));
      employees.data?.forEach((r) => next.push({
        id: r.id, group: 'employees', icon: UserCheck, title: r.full_name || '', subtitle: r.position || undefined,
        url: `${base}/hr/employees`,
      }));

      setHits(next);
      setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, base]);

  const go = (url: string) => {
    setOpen(false);
    navigate(url);
  };

  const quickCreate = [
    { label: t('nav.leads'), icon: User, url: `${base}/crm/leads?create=true` },
    { label: t('nav.deals'), icon: Briefcase, url: `${base}/crm/deals?create=true` },
    { label: t('nav.invoices'), icon: FileText, url: `${base}/finance/invoices?create=true` },
    { label: t('nav.tasks'), icon: ClipboardList, url: `${base}/work/tasks?create=true` },
  ];

  const pages = [
    { label: t('nav.dashboard'), icon: LayoutDashboard, url: `${base}/dashboard` },
    { label: t('nav.leads'), icon: User, url: `${base}/crm/leads` },
    { label: t('nav.deals'), icon: Briefcase, url: `${base}/crm/deals` },
    { label: t('nav.icp') || 'ICP Finder', icon: Target, url: `${base}/crm/icp` },
    { label: t('nav.metaAds'), icon: Megaphone, url: `${base}/marketing/meta-ads` },
    { label: t('nav.smartInbox'), icon: Mail, url: `${base}/email/emails` },
    { label: t('nav.invoices'), icon: FileText, url: `${base}/finance/invoices` },
    { label: t('nav.quotes'), icon: FileText, url: `${base}/finance/quotes` },
    { label: t('nav.payments'), icon: CreditCard, url: `${base}/finance/payments` },
    { label: t('nav.employees') || 'Employees', icon: UserCheck, url: `${base}/hr/employees` },
    { label: t('nav.tasks'), icon: ClipboardList, url: `${base}/work/tasks` },
    { label: t('nav.calendar'), icon: Calendar, url: `${base}/work/calendar` },
    { label: t('nav.clowdbot'), icon: Bot, url: `${base}/pa` },
    { label: t('nav.settings'), icon: Settings, url: `${base}/settings/company` },
  ];

  const showingSearch = query.trim().length >= 2;

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={!showingSearch}>
      <CommandInput
        placeholder={t('command.placeholder')}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {showingSearch ? (
          <>
            {!searching && hits.length === 0 && (
              <CommandEmpty>{t('command.noResults')}</CommandEmpty>
            )}
            {(['leads', 'customers', 'deals', 'tasks', 'invoices', 'employees'] as const).map((group) => {
              const groupHits = hits.filter((h) => h.group === group);
              if (groupHits.length === 0) return null;
              return (
                <CommandGroup key={group} heading={t(`command.${group}`)}>
                  {groupHits.map((hit) => (
                    <CommandItem key={`${group}-${hit.id}`} value={`${group}-${hit.id}`} onSelect={() => go(hit.url)}>
                      <hit.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{hit.title}</span>
                      {hit.subtitle && <span className="ml-2 truncate text-xs text-muted-foreground">{hit.subtitle}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </>
        ) : (
          <>
            <CommandGroup heading={t('command.quickCreate')}>
              {quickCreate.map((action) => (
                <CommandItem key={action.url} value={`create-${action.label}`} onSelect={() => go(action.url)}>
                  <action.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{t('command.createPrefix')} {action.label}</span>
                  <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading={t('command.goTo')}>
              {pages.map((page) => (
                <CommandItem key={page.url} value={`goto-${page.label}-${page.url}`} onSelect={() => go(page.url)}>
                  <page.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{page.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
