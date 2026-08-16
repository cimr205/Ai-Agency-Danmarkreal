import { useLocation, useParams, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { isLocale, useI18n } from '@/lib/i18n';

const ROUTE_LABELS: Record<string, Record<string, string>> = {
  da: {
    dashboard: 'Dashboard',
    crm: 'CRM',
    leads: 'Leads',
    deals: 'Deals',
    pipeline: 'Pipeline',
    'lead-generation': 'Lead Generering',
    marketing: 'Marketing',
    'meta-ads': 'Meta Ads',
    'cold-caller': 'Power Dialer',
    email: 'Email',
    emails: 'Smart Indbakke',
    bulk: 'Masse-email',
    finance: 'Finans',
    invoices: 'Fakturaer',
    payments: 'Betalinger',
    hr: 'HR',
    employees: 'Medarbejdere',
    attendance: 'Fremmøde',
    leave: 'Ferie/Fravær',
    payroll: 'Løn',
    recruitment: 'Rekruttering',
    work: 'Produktivitet',
    tasks: 'Opgaver',
    calendar: 'Kalender',
    settings: 'Indstillinger',
    company: 'Virksomhed',
    profile: 'Profil',
    invitations: 'Invitationer',
    pa: 'Personlig PA',
    inbox: 'Indbakke',
  },
  en: {
    dashboard: 'Dashboard',
    crm: 'CRM',
    leads: 'Leads',
    deals: 'Deals',
    pipeline: 'Pipeline',
    'lead-generation': 'Lead Generation',
    marketing: 'Marketing',
    'meta-ads': 'Meta Ads',
    'cold-caller': 'Power Dialer',
    email: 'Email',
    emails: 'Smart Inbox',
    bulk: 'Bulk Email',
    finance: 'Finance',
    invoices: 'Invoices',
    payments: 'Payments',
    hr: 'HR',
    employees: 'Employees',
    attendance: 'Attendance',
    leave: 'Leave',
    payroll: 'Payroll',
    recruitment: 'Recruitment',
    work: 'Productivity',
    tasks: 'Tasks',
    calendar: 'Calendar',
    settings: 'Settings',
    company: 'Company',
    profile: 'Profile',
    invitations: 'Invitations',
    pa: 'Personal PA',
    inbox: 'Inbox',
  },
  de: {
    dashboard: 'Dashboard',
    crm: 'CRM',
    leads: 'Leads',
    deals: 'Deals',
    pipeline: 'Pipeline',
    'lead-generation': 'Lead-Generierung',
    marketing: 'Marketing',
    'meta-ads': 'Meta Ads',
    'cold-caller': 'Power Dialer',
    email: 'E-Mail',
    emails: 'Smart Inbox',
    bulk: 'Massen-E-Mail',
    finance: 'Finanzen',
    invoices: 'Rechnungen',
    payments: 'Zahlungen',
    hr: 'HR',
    employees: 'Mitarbeiter',
    attendance: 'Anwesenheit',
    leave: 'Urlaub',
    payroll: 'Gehaltsabrechnung',
    recruitment: 'Rekrutierung',
    work: 'Produktivität',
    tasks: 'Aufgaben',
    calendar: 'Kalender',
    settings: 'Einstellungen',
    company: 'Unternehmen',
    profile: 'Profil',
    invitations: 'Einladungen',
    pa: 'Persönlicher PA',
    inbox: 'Posteingang',
  },
};

// Segments to skip in breadcrumb display (they are structural, not navigable)
const SKIP_SEGMENTS = new Set(['app']);

export function Breadcrumbs() {
  const location = useLocation();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const labels = ROUTE_LABELS[locale] || ROUTE_LABELS.en;

  const pathParts = location.pathname.split('/').filter(Boolean);
  // Remove locale prefix
  const segments = pathParts.filter(s => s !== locale && !SKIP_SEGMENTS.has(s));

  // Don't show breadcrumbs on dashboard (it's the root)
  if (segments.length <= 1 && segments[0] === 'dashboard') return null;
  if (segments.length === 0) return null;

  const crumbs = segments.map((segment, i) => {
    const path = `/${locale}/app/${segments.slice(0, i + 1).join('/')}`;
    const label = labels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
    const isLast = i === segments.length - 1;
    return { path, label, isLast };
  });

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-4" aria-label="Breadcrumb">
      <Link to={`/${locale}/app/dashboard`} className="hover:text-foreground transition-colors p-0.5">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
          {crumb.isLast ? (
            <span className="font-medium text-foreground">{crumb.label}</span>
          ) : (
            <Link to={crumb.path} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
