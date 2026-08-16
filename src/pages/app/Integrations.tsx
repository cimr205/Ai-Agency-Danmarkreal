import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plug, Mail, CreditCard, Calendar, Bot, Database, BarChart3, CheckCircle2, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  status: 'connected' | 'available' | 'coming_soon';
  category: string;
}

const integrations: Integration[] = [
  { id: 'lovable-ai', name: 'Din personlige PA', description: 'AI-drevet analyse og anbefalinger via Lovable AI', icon: Bot, status: 'connected', category: 'AI' },
  { id: 'gmail', name: 'Gmail', description: 'Synkroniser emails og opret automatiske to-dos', icon: Mail, status: 'available', category: 'Email' },
  { id: 'outlook', name: 'Outlook', description: 'Microsoft email integration', icon: Mail, status: 'coming_soon', category: 'Email' },
  { id: 'stripe', name: 'Stripe', description: 'Online betalinger og abonnementer', icon: CreditCard, status: 'available', category: 'Betaling' },
  { id: 'quickpay', name: 'QuickPay', description: 'Dansk betalingsgateway', icon: CreditCard, status: 'available', category: 'Betaling' },
  { id: 'google-cal', name: 'Google Calendar', description: 'Synkroniser møder og events', icon: Calendar, status: 'coming_soon', category: 'Kalender' },
  { id: 'analytics', name: 'Google Analytics', description: 'Website-tracking og konverteringsdata', icon: BarChart3, status: 'coming_soon', category: 'Analytics' },
  { id: 'hubspot', name: 'HubSpot', description: 'CRM-import og lead-synkronisering', icon: Database, status: 'coming_soon', category: 'CRM' },
];

const statusConfig = {
  connected: { label: 'Forbundet', color: 'bg-green-100 text-green-800' },
  available: { label: 'Tilgængelig', color: 'bg-blue-100 text-blue-800' },
  coming_soon: { label: 'Kommer snart', color: 'bg-muted text-muted-foreground' },
};

export default function IntegrationsPage() {
  const categories = [...new Set(integrations.map(i => i.category))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Plug className="h-6 w-6" /> Integrationer</h1>
        <p className="text-sm text-muted-foreground">Forbind eksterne tjenester til dit system</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Forbundne</p><p className="text-2xl font-bold text-green-600">{integrations.filter(i => i.status === 'connected').length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Tilgængelige</p><p className="text-2xl font-bold text-blue-600">{integrations.filter(i => i.status === 'available').length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Kommer snart</p><p className="text-2xl font-bold text-muted-foreground">{integrations.filter(i => i.status === 'coming_soon').length}</p></CardContent></Card>
      </div>

      {categories.map(cat => (
        <div key={cat} className="space-y-3">
          <h2 className="text-lg font-medium">{cat}</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {integrations.filter(i => i.category === cat).map(integration => {
              const Icon = integration.icon;
              const cfg = statusConfig[integration.status];
              return (
                <Card key={integration.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <Badge className={cfg.color}>{cfg.label}</Badge>
                    </div>
                    <CardTitle className="text-base">{integration.name}</CardTitle>
                    <CardDescription>{integration.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {integration.status === 'connected' ? (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle2 className="h-4 w-4" /> Aktiv
                      </div>
                    ) : integration.status === 'available' ? (
                      <Button variant="outline" size="sm" onClick={() => toast.info(`${integration.name} integration kræver opsætning. Kontakt administrator.`)}>
                        Forbind
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">Denne integration er under udvikling</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
