import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { isLocale, useI18n } from '@/lib/i18n';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Target, Briefcase, FileText, Users, CalendarDays, CheckSquare,
  Mail, Bot, BarChart3, Settings, UserPlus, Search, Megaphone,
  DollarSign, Clock,
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  keywords: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const params = useParams();
  const { t } = useI18n();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const base = `/${locale}/app`;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      // Global shortcuts (only when no input focused)
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const items: NavItem[] = useMemo(() => [
    { label: 'Dashboard', path: `${base}/dashboard`, icon: BarChart3, keywords: 'home oversigt overview' },
    { label: 'Leads', path: `${base}/crm/leads`, icon: Target, keywords: 'crm kontakter contacts' },
    { label: 'Pipeline', path: `${base}/crm/pipeline`, icon: BarChart3, keywords: 'pipeline funnel tragt' },
    { label: 'Deals', path: `${base}/crm/deals`, icon: Briefcase, keywords: 'deals aftaler salg sales' },
    { label: t('nav.leadGeneration') || 'Lead Generation', path: `${base}/crm/lead-generation`, icon: Search, keywords: 'find søg search generate' },
    { label: t('nav.invoices') || 'Invoices', path: `${base}/finance/invoices`, icon: FileText, keywords: 'faktura invoice regning billing' },
    { label: t('nav.payments') || 'Payments', path: `${base}/finance/payments`, icon: DollarSign, keywords: 'betaling payment' },
    { label: t('nav.employees') || 'Employees', path: `${base}/hr/employees`, icon: Users, keywords: 'medarbejdere ansatte hr' },
    { label: t('nav.attendance') || 'Attendance', path: `${base}/hr/attendance`, icon: Clock, keywords: 'fremmøde attendance' },
    { label: t('nav.leave') || 'Leave', path: `${base}/hr/leave`, icon: CalendarDays, keywords: 'ferie fravær leave' },
    { label: t('nav.payroll') || 'Payroll', path: `${base}/hr/payroll`, icon: DollarSign, keywords: 'løn payroll' },
    { label: t('nav.recruitment') || 'Recruitment', path: `${base}/hr/recruitment`, icon: UserPlus, keywords: 'rekruttering hiring' },
    { label: t('nav.tasks') || 'Tasks', path: `${base}/work/tasks`, icon: CheckSquare, keywords: 'opgaver tasks todo' },
    { label: t('nav.calendar') || 'Calendar', path: `${base}/work/calendar`, icon: CalendarDays, keywords: 'kalender calendar møde meeting' },
    { label: t('nav.inbox') || 'Inbox', path: `${base}/work/inbox`, icon: Mail, keywords: 'indbakke inbox email' },
    { label: t('nav.emails') || 'Email', path: `${base}/email/emails`, icon: Mail, keywords: 'email smart inbox' },
    { label: t('nav.bulkEmail') || 'Bulk Email', path: `${base}/email/bulk`, icon: Megaphone, keywords: 'bulk email kampagne campaign' },
    { label: 'Meta Ads', path: `${base}/marketing/meta-ads`, icon: Megaphone, keywords: 'meta facebook ads reklame' },
    { label: 'Power Dialer', path: `${base}/marketing/cold-caller`, icon: Megaphone, keywords: 'power dialer ring opkald telefon' },
    { label: t('nav.pa') || 'PA', path: `${base}/pa`, icon: Bot, keywords: 'assistent ai bot chat pa' },
    { label: t('nav.settings') || 'Settings', path: `${base}/settings/company`, icon: Settings, keywords: 'indstillinger settings firma company' },
    { label: t('nav.profile') || 'Profile', path: `${base}/settings/profile`, icon: Users, keywords: 'profil profile konto account' },
    { label: t('nav.invitations') || 'Invitations', path: `${base}/settings/invitations`, icon: UserPlus, keywords: 'invitationer invite team' },
  ], [base, t]);

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={locale === 'da' ? 'Søg eller naviger... (⌘K)' : 'Search or navigate... (⌘K)'} />
      <CommandList>
        <CommandEmpty>{locale === 'da' ? 'Ingen resultater fundet.' : 'No results found.'}</CommandEmpty>
        <CommandGroup heading={locale === 'da' ? 'Navigation' : 'Navigation'}>
          {items.map(item => (
            <CommandItem
              key={item.path}
              value={`${item.label} ${item.keywords}`}
              onSelect={() => handleSelect(item.path)}
              className="gap-2 cursor-pointer"
            >
              <item.icon className="h-4 w-4 text-muted-foreground" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
