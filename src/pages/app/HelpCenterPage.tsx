import { useState } from 'react';
import { Search, BookOpen, Users, CreditCard, Mail, BarChart3, Settings, Shield, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n';

// Help content was Danish-only. Each text now carries all three languages and
// is picked at render time (not at import time) so switching locale works.
type L = { da: string; en: string; de: string };

type CategoryKey = 'start' | 'crm' | 'email' | 'billing' | 'hr' | 'security' | 'ai' | 'integrations';

interface HelpArticle {
  id: string;
  category: CategoryKey;
  title: L;
  content: L;
  tags: string[];
}

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: '1', category: 'start',
    title: { da: 'Sådan opretter du din første lead', en: 'How to create your first lead', de: 'So erstellen Sie Ihren ersten Lead' },
    content: {
      da: 'Gå til CRM → Leads og klik "Tilføj lead". Udfyld navn, email og eventuelle noter. Du kan også importere leads via CSV-upload.',
      en: 'Go to CRM → Leads and click "Add lead". Fill in name, email and any notes. You can also import leads with a CSV upload.',
      de: 'Gehen Sie zu CRM → Leads und klicken Sie auf „Lead hinzufügen“. Füllen Sie Name, E-Mail und ggf. Notizen aus. Leads lassen sich auch per CSV-Upload importieren.',
    },
    tags: ['leads', 'crm', 'opret', 'create'],
  },
  {
    id: '2', category: 'start',
    title: { da: 'Inviter teammedlemmer', en: 'Invite team members', de: 'Teammitglieder einladen' },
    content: {
      da: 'Gå til Indstillinger → Invitationer og klik "Inviter". Indtast kollegaens email og vælg en rolle (medarbejder, manager eller admin).',
      en: 'Go to Settings → Invitations and click "Invite". Enter your colleague\'s email and choose a role (employee, manager or admin).',
      de: 'Gehen Sie zu Einstellungen → Einladungen und klicken Sie auf „Einladen“. Geben Sie die E-Mail ein und wählen Sie eine Rolle (Mitarbeiter, Manager oder Admin).',
    },
    tags: ['team', 'invitationer', 'invitations', 'roller', 'roles'],
  },
  {
    id: '3', category: 'crm',
    title: { da: 'Brug pipeline til at følge deals', en: 'Use the pipeline to track deals', de: 'Deals in der Pipeline verfolgen' },
    content: {
      da: 'Pipeline-visningen giver et kanban-board over dine deals. Træk kort mellem faser for at opdatere status.',
      en: 'The pipeline view gives you a kanban board of your deals. Drag cards between stages to update their status.',
      de: 'Die Pipeline-Ansicht zeigt Ihre Deals als Kanban-Board. Ziehen Sie Karten zwischen den Phasen, um den Status zu ändern.',
    },
    tags: ['pipeline', 'deals', 'kanban'],
  },
  {
    id: '4', category: 'crm',
    title: { da: 'ICP-scoring – hvad er det?', en: 'ICP scoring – what is it?', de: 'ICP-Scoring – was ist das?' },
    content: {
      da: 'ICP (Ideal Customer Profile) scoring matcher dine leads mod din ideelle kundeprofil. Systemet scorer automatisk ud fra branche, størrelse, lokation og mere.',
      en: 'ICP (Ideal Customer Profile) scoring matches your leads against your ideal customer profile. Leads are scored automatically by industry, size, location and more.',
      de: 'ICP-Scoring (Ideal Customer Profile) gleicht Ihre Leads mit Ihrem idealen Kundenprofil ab. Bewertet wird automatisch nach Branche, Größe, Standort und mehr.',
    },
    tags: ['icp', 'scoring', 'leads'],
  },
  {
    id: '5', category: 'email',
    title: { da: 'Tilslut din Gmail-konto', en: 'Connect your Gmail account', de: 'Gmail-Konto verbinden' },
    content: {
      da: 'Gå til Email og klik "Tilslut Gmail". Du bliver guidet igennem Google-login. Herefter synkroniserer systemet dine emails automatisk.',
      en: 'Go to Email and click "Connect Gmail". You are guided through the Google sign-in. After that your emails sync automatically.',
      de: 'Gehen Sie zu E-Mail und klicken Sie auf „Gmail verbinden“. Sie werden durch die Google-Anmeldung geführt. Danach werden Ihre E-Mails automatisch synchronisiert.',
    },
    tags: ['email', 'gmail', 'integration'],
  },
  {
    id: '6', category: 'email',
    title: { da: 'Massemail – send til mange modtagere', en: 'Bulk email – send to many recipients', de: 'Massen-E-Mail – an viele Empfänger senden' },
    content: {
      da: 'Under Email → Massemail kan du oprette kampagner. Vælg modtagere, skriv emne og indhold, og send. Du kan følge åbningsrater og afmeldinger.',
      en: 'Under Email → Bulk email you can create campaigns. Pick recipients, write subject and content, and send. You can track open rates and unsubscribes.',
      de: 'Unter E-Mail → Massen-E-Mail erstellen Sie Kampagnen. Empfänger wählen, Betreff und Inhalt schreiben, senden. Öffnungsraten und Abmeldungen lassen sich verfolgen.',
    },
    tags: ['massemail', 'bulk', 'kampagner', 'campaigns'],
  },
  {
    id: '7', category: 'billing',
    title: { da: 'Administrer dit abonnement', en: 'Manage your subscription', de: 'Abonnement verwalten' },
    content: {
      da: 'Under Indstillinger → Virksomhed finder du "Administrer abonnement". Her kan du opgradere, nedgradere eller ændre betalingsmetode via Stripe-portalen.',
      en: 'Under Settings → Company you will find "Manage subscription". There you can upgrade, downgrade or change payment method in the Stripe portal.',
      de: 'Unter Einstellungen → Unternehmen finden Sie „Abonnement verwalten“. Dort können Sie im Stripe-Portal upgraden, downgraden oder die Zahlungsmethode ändern.',
    },
    tags: ['abonnement', 'subscription', 'stripe', 'betaling', 'payment'],
  },
  {
    id: '8', category: 'billing',
    title: { da: 'Hvad sker der efter prøveperioden?', en: 'What happens after the trial?', de: 'Was passiert nach der Testphase?' },
    content: {
      da: 'Din 14-dages prøveperiode giver fuld adgang. Herefter skal du tilføje en betalingsmetode for at fortsætte. Du mister ingen data.',
      en: 'Your 14-day trial gives full access. After that you need to add a payment method to continue. You do not lose any data.',
      de: 'Die 14-tägige Testphase bietet vollen Zugriff. Danach fügen Sie eine Zahlungsmethode hinzu, um weiterzumachen. Es gehen keine Daten verloren.',
    },
    tags: ['trial', 'prøveperiode', 'betaling', 'payment'],
  },
  {
    id: '9', category: 'hr',
    title: { da: 'Tilføj medarbejdere', en: 'Add employees', de: 'Mitarbeiter hinzufügen' },
    content: {
      da: 'Gå til HR → Medarbejdere og klik "Tilføj". Udfyld navn, email, afdeling og stilling. Medarbejdere kan evt. linkes til en brugerkonto.',
      en: 'Go to HR → Employees and click "Add". Fill in name, email, department and position. Employees can be linked to a user account.',
      de: 'Gehen Sie zu HR → Mitarbeiter und klicken Sie auf „Hinzufügen“. Name, E-Mail, Abteilung und Position ausfüllen. Mitarbeiter können mit einem Benutzerkonto verknüpft werden.',
    },
    tags: ['hr', 'medarbejdere', 'employees'],
  },
  {
    id: '10', category: 'security',
    title: { da: 'Roller og adgangsrettigheder', en: 'Roles and access rights', de: 'Rollen und Zugriffsrechte' },
    content: {
      da: 'Systemet har flere rolleniveauer: Medarbejder, Manager, Admin (Owner) og System Admin. Hver rolle har forskellig adgang til data og funktioner.',
      en: 'There are several role levels: Employee, Manager, Admin (Owner) and System Admin. Each role has different access to data and features.',
      de: 'Es gibt mehrere Rollenstufen: Mitarbeiter, Manager, Admin (Owner) und System-Admin. Jede Rolle hat unterschiedlichen Zugriff auf Daten und Funktionen.',
    },
    tags: ['roller', 'roles', 'sikkerhed', 'security', 'adgang', 'access'],
  },
  {
    id: '11', category: 'ai',
    title: { da: 'AI-assistenten (ClowdBot)', en: 'The AI assistant (ClowdBot)', de: 'Der KI-Assistent (ClowdBot)' },
    content: {
      da: 'ClowdBot er din personlige AI-assistent. Den kan hjælpe med at skrive emails, analysere data, generere rapporter og besvare spørgsmål om dit CRM.',
      en: 'ClowdBot is your personal AI assistant. It can help write emails, analyse data, generate reports and answer questions about your CRM.',
      de: 'ClowdBot ist Ihr persönlicher KI-Assistent. Er hilft beim Schreiben von E-Mails, Analysieren von Daten, Erstellen von Berichten und beantwortet Fragen zu Ihrem CRM.',
    },
    tags: ['ai', 'clowdbot', 'assistent', 'assistant'],
  },
  {
    id: '12', category: 'integrations',
    title: { da: 'Meta Ads-integration', en: 'Meta Ads integration', de: 'Meta-Ads-Integration' },
    content: {
      da: 'Tilslut din Meta Business-konto under Marketing → Meta Ads. Du kan se kampagne-performance, oprette annoncer og få AI-anbefalinger.',
      en: 'Connect your Meta Business account under Marketing → Meta Ads. You can see campaign performance, create ads and get AI recommendations.',
      de: 'Verbinden Sie Ihr Meta-Business-Konto unter Marketing → Meta Ads. Sie sehen Kampagnen-Performance, erstellen Anzeigen und erhalten KI-Empfehlungen.',
    },
    tags: ['meta', 'facebook', 'annoncer', 'ads'],
  },
];

const CATEGORIES: { key: CategoryKey; name: L; icon: typeof BookOpen; color: string }[] = [
  { key: 'start', name: { da: 'Kom i gang', en: 'Getting started', de: 'Erste Schritte' }, icon: BookOpen, color: 'text-primary' },
  { key: 'crm', name: { da: 'CRM & Pipeline', en: 'CRM & Pipeline', de: 'CRM & Pipeline' }, icon: BarChart3, color: 'text-success' },
  { key: 'email', name: { da: 'Email', en: 'Email', de: 'E-Mail' }, icon: Mail, color: 'text-chart-cyan' },
  { key: 'billing', name: { da: 'Betaling & abonnement', en: 'Billing & subscription', de: 'Abrechnung & Abonnement' }, icon: CreditCard, color: 'text-warning' },
  { key: 'hr', name: { da: 'HR & medarbejdere', en: 'HR & workforce', de: 'HR & Personal' }, icon: Users, color: 'text-primary' },
  { key: 'security', name: { da: 'Sikkerhed', en: 'Security', de: 'Sicherheit' }, icon: Shield, color: 'text-destructive' },
  { key: 'ai', name: { da: 'AI & automatisering', en: 'AI & automation', de: 'KI & Automatisierung' }, icon: Settings, color: 'text-chart-violet' },
  { key: 'integrations', name: { da: 'Integrationer', en: 'Integrations', de: 'Integrationen' }, icon: Settings, color: 'text-muted-foreground' },
];

const UI: Record<'search' | 'articles' | 'allCategories', L> = {
  search: { da: 'Søg i artikler...', en: 'Search articles...', de: 'Artikel durchsuchen...' },
  articles: { da: 'artikler', en: 'articles', de: 'Artikel' },
  allCategories: { da: 'Alle kategorier', en: 'All categories', de: 'Alle Kategorien' },
};

export default function HelpCenterPage() {
  const { t, locale } = useI18n();
  const lang: keyof L = locale === 'da' || locale === 'de' ? locale : 'en';
  const pick = (v: L) => v[lang];
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);

  const q = search.toLowerCase();
  const filtered = HELP_ARTICLES.filter(a => {
    const matchesSearch = !q ||
      pick(a.title).toLowerCase().includes(q) ||
      pick(a.content).toLowerCase().includes(q) ||
      a.tags.some(tag => tag.includes(q));
    const matchesCategory = !selectedCategory || a.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  const categoryName = (key: CategoryKey) => pick(CATEGORIES.find(c => c.key === key)!.name);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{t('helpCenter.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('helpCenter.subtitle')}</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={pick(UI.search)}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Categories */}
      {!search && !selectedCategory && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {CATEGORIES.map(cat => {
            const count = HELP_ARTICLES.filter(a => a.category === cat.key).length;
            return (
              <Card
                key={cat.key}
                className="cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => setSelectedCategory(cat.key)}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <cat.icon className={`w-5 h-5 ${cat.color} shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug line-clamp-2" title={pick(cat.name)}>{pick(cat.name)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{count} {pick(UI.articles)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Category header */}
      {selectedCategory && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className="text-sm text-primary hover:underline"
          >
            {pick(UI.allCategories)}
          </button>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-sm font-medium">{categoryName(selectedCategory)}</span>
        </div>
      )}

      {/* Articles */}
      <Accordion type="single" collapsible className="space-y-2">
        {filtered.map(article => (
          <AccordionItem key={article.id} value={article.id} className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium hover:no-underline">
              <div className="flex items-center gap-2 text-left">
                <span>{pick(article.title)}</span>
                {(search || selectedCategory) && (
                  <Badge variant="secondary" className="text-[10px] h-5">{categoryName(article.category)}</Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
              {pick(article.content)}
            </AccordionContent>
          </AccordionItem>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('helpCenter.noResults')}</p>
          </div>
        )}
      </Accordion>
    </div>
  );
}
