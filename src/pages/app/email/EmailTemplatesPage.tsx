import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, FileText, Trash2, Copy, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import type { Tables } from '@/integrations/supabase/types';

type EmailTemplate = Tables<'email_templates'>;

const CATEGORIES = ['general', 'sales', 'followup', 'onboarding', 'support', 'marketing'];
const VARIABLES = ['{{first_name}}', '{{last_name}}', '{{company}}', '{{email}}', '{{deal_value}}', '{{invoice_number}}'];

const STARTER_TEMPLATES = [
  {
    name: 'Introduction Email',
    name_da: 'Introduktions-email',
    subject: 'Hi {{first_name}}, great to connect!',
    subject_da: 'Hej {{first_name}}, dejligt at mødes!',
    body: 'Hi {{first_name}},\n\nThank you for your interest in our services. I wanted to reach out and introduce myself.\n\nI\'d love to schedule a quick call to learn more about {{company}} and how we can help.\n\nBest regards',
    body_da: 'Hej {{first_name}},\n\nTak for din interesse i vores tjenester. Jeg ville gerne præsentere mig.\n\nJeg vil gerne aftale et kort opkald for at lære mere om {{company}} og hvordan vi kan hjælpe.\n\nVenlig hilsen',
    category: 'sales',
  },
  {
    name: 'Follow-up Reminder',
    name_da: 'Opfølgningspåmindelse',
    subject: 'Following up — {{company}}',
    subject_da: 'Opfølgning — {{company}}',
    body: 'Hi {{first_name}},\n\nI wanted to follow up on our previous conversation. Have you had a chance to review our proposal?\n\nI\'m happy to answer any questions you might have.\n\nBest regards',
    body_da: 'Hej {{first_name}},\n\nJeg ville gerne følge op på vores tidligere samtale. Har du haft mulighed for at gennemgå vores tilbud?\n\nJeg svarer gerne på spørgsmål.\n\nVenlig hilsen',
    category: 'followup',
  },
  {
    name: 'Quote/Proposal',
    name_da: 'Tilbud/Forslag',
    subject: 'Your quote from us — {{deal_value}}',
    subject_da: 'Dit tilbud fra os — {{deal_value}}',
    body: 'Hi {{first_name}},\n\nPlease find attached our quote for the discussed services.\n\nTotal: {{deal_value}}\n\nThis quote is valid for 14 days. Please don\'t hesitate to reach out with any questions.\n\nBest regards',
    body_da: 'Hej {{first_name}},\n\nHermed vores tilbud på de diskuterede tjenester.\n\nTotal: {{deal_value}}\n\nTilbuddet er gyldigt i 14 dage. Tøv ikke med at kontakte os med spørgsmål.\n\nVenlig hilsen',
    category: 'sales',
  },
  {
    name: 'Invoice Reminder',
    name_da: 'Fakturapåmindelse',
    subject: 'Invoice {{invoice_number}} — payment reminder',
    subject_da: 'Faktura {{invoice_number}} — betalingspåmindelse',
    body: 'Hi {{first_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} is due for payment.\n\nIf you have already made the payment, please disregard this email.\n\nBest regards',
    body_da: 'Hej {{first_name}},\n\nDette er en venlig påmindelse om at faktura {{invoice_number}} forfalder til betaling.\n\nHvis du allerede har betalt, kan du se bort fra denne email.\n\nVenlig hilsen',
    category: 'general',
  },
  {
    name: 'Welcome / Onboarding',
    name_da: 'Velkommen / Onboarding',
    subject: 'Welcome aboard, {{first_name}}!',
    subject_da: 'Velkommen ombord, {{first_name}}!',
    body: 'Hi {{first_name}},\n\nWelcome to {{company}}! We\'re thrilled to have you on board.\n\nHere\'s what to expect next:\n1. A quick intro call\n2. Access to our platform\n3. Your dedicated point of contact\n\nLooking forward to working together!\n\nBest regards',
    body_da: 'Hej {{first_name}},\n\nVelkommen til {{company}}! Vi er glade for at have dig med.\n\nHer er hvad du kan forvente:\n1. Et kort intro-opkald\n2. Adgang til vores platform\n3. Din dedikerede kontaktperson\n\nVi glæder os til samarbejdet!\n\nVenlig hilsen',
    category: 'onboarding',
  },
];

function useEmailTemplates() {
  return useQuery({
    queryKey: ['email_templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('email_templates').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useCreateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; subject: string; body: string; category: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', session.user.id).single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase.from('email_templates').insert({
        ...input, company_id: profile.company_id, created_by: session.user.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email_templates'] }),
  });
}

function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email_templates'] }),
  });
}

export default function EmailTemplatesPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('general');
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

  const { data: templates, isLoading } = useEmailTemplates();
  const qc = useQueryClient();
  const createTemplate = useCreateEmailTemplate();
  const deleteTemplate = useDeleteEmailTemplate();

  const filtered = (templates ?? []).filter((t: EmailTemplate) =>
    t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!name.trim() || !subject.trim()) { toast.error('Name and subject required'); return; }
    try {
      await createTemplate.mutateAsync({ name, subject, body, category });
      toast.success(t('emailTemplates.created'));
      setCreateOpen(false);
      setName(''); setSubject(''); setBody(''); setCategory('general');
    } catch { toast.error(t('common.error')); }
  };

  const insertVariable = (variable: string) => {
    setBody(prev => prev + variable);
  };

  const copyTemplate = (tpl: EmailTemplate) => {
    navigator.clipboard.writeText(tpl.body);
    toast.success(t('emailTemplates.copied'));
  };

  const categoryColors: Record<string, string> = {
    general: 'bg-muted text-muted-foreground',
    sales: 'bg-primary/10 text-primary',
    followup: 'bg-yellow-500/10 text-yellow-600',
    onboarding: 'bg-emerald-500/10 text-emerald-600',
    support: 'bg-blue-500/10 text-blue-600',
    marketing: 'bg-purple-500/10 text-purple-600',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('emailTemplates.title')}</h1>
          <p className="text-muted-foreground">{t('emailTemplates.subtitle')}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t('emailTemplates.create')}</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{t('emailTemplates.createTitle')}</DialogTitle><DialogDescription>{t('emailTemplates.createSubtitle')}</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t('emailTemplates.name')} *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Welcome email" /></div>
                <div>
                  <Label>{t('emailTemplates.category')}</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>{t('emailTemplates.subject')} *</Label><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Hi {{first_name}}, ..." /></div>
              <div>
                <div className="flex items-center justify-between">
                  <Label>{t('emailTemplates.body')}</Label>
                  <div className="flex gap-1 flex-wrap">
                    {VARIABLES.map(v => (
                      <button key={v} onClick={() => insertVariable(v)} className="px-2 py-0.5 rounded text-[10px] font-mono bg-muted hover:bg-muted/80 text-muted-foreground">{v}</button>
                    ))}
                  </div>
                </div>
                <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder={t('emailTemplates.bodyPlaceholder')} rows={8} className="mt-1 font-mono text-sm" />
              </div>
              <Button onClick={handleCreate} disabled={createTemplate.isPending} className="w-full">
                {createTemplate.isPending ? t('common.saving') : t('emailTemplates.createCta')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t('emailTemplates.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Card key={i}><CardContent className="pt-6"><div className="h-20 bg-muted animate-pulse rounded" /></CardContent></Card>)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Mail className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('emailTemplates.emptyTitle')}</h3>
            <p className="text-muted-foreground mb-4">{t('emailTemplates.emptyDesc')}</p>
            <div className="flex gap-3">
              <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />{t('emailTemplates.createFirst')}</Button>
              <Button variant="outline" onClick={async () => {
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) return;
                  const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', session.user.id).single();
                  if (!profile?.company_id) return;
                  const isDa = t('common.language') === 'Dansk' || document.documentElement.lang === 'da';
                  const inserts = STARTER_TEMPLATES.map(tpl => ({
                    name: isDa ? tpl.name_da : tpl.name,
                    subject: isDa ? tpl.subject_da : tpl.subject,
                    body: isDa ? tpl.body_da : tpl.body,
                    category: tpl.category,
                    company_id: profile.company_id,
                    created_by: session.user.id,
                  }));
                  const { error } = await supabase.from('email_templates').insert(inserts);
                  if (error) throw error;
                  toast.success(isDa ? '5 startskabeloner oprettet!' : '5 starter templates created!');
                  qc.invalidateQueries({ queryKey: ['email_templates'] });
                } catch { toast.error(t('common.error')); }
              }}>
                <FileText className="h-4 w-4 mr-2" />
                {t('emailTemplates.seedStarters') || 'Load starter templates'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tpl: EmailTemplate) => (
            <Card key={tpl.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setPreviewTemplate(tpl)}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 min-w-0">
                    <p className="font-medium truncate">{tpl.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{tpl.subject}</p>
                  </div>
                  <Badge className={categoryColors[tpl.category] || categoryColors.general}>{tpl.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{tpl.body}</p>
                <div className="flex items-center gap-1 pt-1">
                  <Button variant="ghost" size="sm" className="h-7" onClick={e => { e.stopPropagation(); copyTemplate(tpl); }}><Copy className="h-3.5 w-3.5 mr-1" />Copy</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={e => { e.stopPropagation(); deleteTemplate.mutate(tpl.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={open => { if (!open) setPreviewTemplate(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{previewTemplate?.name}</DialogTitle></DialogHeader>
          {previewTemplate && (
            <div className="space-y-4">
              <div><Label className="text-xs text-muted-foreground">Subject</Label><p className="font-medium">{previewTemplate.subject}</p></div>
              <div><Label className="text-xs text-muted-foreground">Body</Label><div className="mt-1 p-4 bg-muted rounded-lg text-sm whitespace-pre-wrap font-mono">{previewTemplate.body}</div></div>
              <Button onClick={() => copyTemplate(previewTemplate)} className="w-full"><Copy className="h-4 w-4 mr-2" />{t('emailTemplates.copyToUse')}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
