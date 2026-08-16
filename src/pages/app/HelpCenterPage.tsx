import { useState } from 'react';
import { Search, BookOpen, Users, CreditCard, Mail, BarChart3, Settings, Shield, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';

interface HelpArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
}

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: '1', category: 'Kom i gang',
    title: 'Sådan opretter du din første lead',
    content: 'Gå til CRM → Leads og klik "Opret Lead". Udfyld navn, email og eventuelle noter. Du kan også importere leads via CSV-upload.',
    tags: ['leads', 'crm', 'opret'],
  },
  {
    id: '2', category: 'Kom i gang',
    title: 'Inviter teammedlemmer',
    content: 'Gå til Indstillinger → Invitationer og klik "Inviter". Indtast kollegaens email og vælg en rolle (medarbejder, manager eller admin).',
    tags: ['team', 'invitationer', 'roller'],
  },
  {
    id: '3', category: 'CRM & Pipeline',
    title: 'Brug pipeline til at tracke deals',
    content: 'Pipeline-visningen giver et kanban-board over dine deals. Træk kort mellem stages for at opdatere status. Tilpas stages under Pipeline → Rediger Stages.',
    tags: ['pipeline', 'deals', 'kanban'],
  },
  {
    id: '4', category: 'CRM & Pipeline',
    title: 'ICP Scoring – hvad er det?',
    content: 'ICP (Ideal Customer Profile) scoring matcher dine leads mod din ideelle kundeprofil. Systemet scorer automatisk baseret på branche, størrelse, lokation og mere.',
    tags: ['icp', 'scoring', 'leads'],
  },
  {
    id: '5', category: 'Email',
    title: 'Tilslut din Gmail-konto',
    content: 'Gå til Email → Indstillinger og klik "Tilslut Gmail". Du bliver guidet igennem Google OAuth. Herefter synkroniserer systemet dine emails automatisk.',
    tags: ['email', 'gmail', 'integration'],
  },
  {
    id: '6', category: 'Email',
    title: 'Massemail – send til mange modtagere',
    content: 'Under Email → Massemail kan du oprette kampagner. Vælg modtagere, skriv emne og indhold, og send. Du kan tracke åbningsrater og afmeldinger.',
    tags: ['massemail', 'kampagner', 'bulk'],
  },
  {
    id: '7', category: 'Billing & Abonnement',
    title: 'Administrer dit abonnement',
    content: 'Under Indstillinger → Virksomhed finder du "Administrer abonnement". Her kan du opgradere, nedgradere eller ændre betalingsmetode via Stripe-portalen.',
    tags: ['abonnement', 'stripe', 'betaling'],
  },
  {
    id: '8', category: 'Billing & Abonnement',
    title: 'Hvad sker der efter prøveperioden?',
    content: 'Din 14-dages prøveperiode giver fuld adgang. Herefter skal du tilføje en betalingsmetode for at fortsætte. Du mister ingen data.',
    tags: ['trial', 'prøveperiode', 'betaling'],
  },
  {
    id: '9', category: 'HR & Workforce',
    title: 'Tilføj medarbejdere',
    content: 'Gå til HR → Medarbejdere og klik "Tilføj". Udfyld navn, email, afdeling og stilling. Medarbejdere kan evt. linkes til en brugerkonto.',
    tags: ['hr', 'medarbejdere', 'tilføj'],
  },
  {
    id: '10', category: 'Sikkerhed',
    title: 'Roller og adgangsrettigheder',
    content: 'Systemet har fire rolleniveauer: Medarbejder, Manager, Admin (Owner) og System Admin. Hver rolle har forskellige adgangsniveauer til data og funktioner.',
    tags: ['roller', 'sikkerhed', 'adgang'],
  },
  {
    id: '11', category: 'AI & Automatisering',
    title: 'AI-assistenten (ClowdBot)',
    content: 'ClowdBot er din personlige AI-assistent. Den kan hjælpe med at skrive emails, analysere data, generere rapporter og besvare spørgsmål om dit CRM.',
    tags: ['ai', 'clowdbot', 'assistent'],
  },
  {
    id: '12', category: 'Integrationer',
    title: 'Meta Ads integration',
    content: 'Tilslut din Meta Business-konto under Marketing → Meta Ads. Du kan se kampagne-performance, oprette annoncer og få AI-anbefalinger.',
    tags: ['meta', 'facebook', 'annoncer'],
  },
];

const CATEGORIES = [
  { name: 'Kom i gang', icon: BookOpen, color: 'text-primary' },
  { name: 'CRM & Pipeline', icon: BarChart3, color: 'text-success' },
  { name: 'Email', icon: Mail, color: 'text-accent' },
  { name: 'Billing & Abonnement', icon: CreditCard, color: 'text-warning' },
  { name: 'HR & Workforce', icon: Users, color: 'text-primary' },
  { name: 'Sikkerhed', icon: Shield, color: 'text-destructive' },
  { name: 'AI & Automatisering', icon: Settings, color: 'text-accent' },
  { name: 'Integrationer', icon: Settings, color: 'text-muted-foreground' },
];

export default function HelpCenterPage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filtered = HELP_ARTICLES.filter(a => {
    const matchesSearch = !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.content.toLowerCase().includes(search.toLowerCase()) ||
      a.tags.some(t => t.includes(search.toLowerCase()));
    const matchesCategory = !selectedCategory || a.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Hjælpecenter</h1>
        <p className="text-sm text-muted-foreground">Find svar på dine spørgsmål</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Søg i artikler..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Categories */}
      {!search && !selectedCategory && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATEGORIES.map(cat => {
            const count = HELP_ARTICLES.filter(a => a.category === cat.name).length;
            return (
              <Card
                key={cat.name}
                className="cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => setSelectedCategory(cat.name)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <cat.icon className={`w-5 h-5 ${cat.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">{count} artikler</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
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
            Alle kategorier
          </button>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-sm font-medium">{selectedCategory}</span>
        </div>
      )}

      {/* Articles */}
      <Accordion type="single" collapsible className="space-y-2">
        {filtered.map(article => (
          <AccordionItem key={article.id} value={article.id} className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium hover:no-underline">
              <div className="flex items-center gap-2 text-left">
                <span>{article.title}</span>
                {(search || selectedCategory) && (
                  <Badge variant="secondary" className="text-[10px] h-5">{article.category}</Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
              {article.content}
            </AccordionContent>
          </AccordionItem>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Ingen artikler fundet. Prøv et andet søgeord.</p>
          </div>
        )}
      </Accordion>
    </div>
  );
}
