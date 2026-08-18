import { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Upload, FileText, X, Paperclip, Users, Eye, ArrowLeft, CheckCircle2, AlertTriangle, Clock, BarChart3, Mail, MailOpen, UserX, TrendingUp, ShieldCheck, ShieldX, Loader2, MessageSquareReply } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useGmailAccount } from '@/hooks/api/useEmail';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getErrorMessage } from '@/lib/errors';

type Recipient = { email: string; name: string; firstName: string; lastName: string; verified?: boolean | null; verifyReason?: string };
type Attachment = { filename: string; content_type: string; data: string; size: number };

function parseCSV(text: string): Recipient[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(/[,;\t]/).map(h => h.trim().replace(/"/g, ''));
  const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('e-mail'));
  const nameIdx = headers.findIndex(h => h === 'name' || h === 'navn' || h === 'full_name' || h === 'fulde navn');
  const firstIdx = headers.findIndex(h => h === 'firstname' || h === 'first_name' || h === 'fornavn');
  const lastIdx = headers.findIndex(h => h === 'lastname' || h === 'last_name' || h === 'efternavn');
  if (emailIdx === -1) return [];
  const sep = headerLine.includes('\t') ? '\t' : headerLine.includes(';') ? ';' : ',';
  return lines.slice(1).map(line => {
    const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    const email = cols[emailIdx] || '';
    let firstName = firstIdx >= 0 ? cols[firstIdx] || '' : '';
    let lastName = lastIdx >= 0 ? cols[lastIdx] || '' : '';
    let name = nameIdx >= 0 ? cols[nameIdx] || '' : '';
    if (!firstName && name) { const parts = name.split(' '); firstName = parts[0] || ''; lastName = parts.slice(1).join(' '); }
    if (!name && firstName) name = `${firstName} ${lastName}`.trim();
    return { email, name, firstName, lastName };
  }).filter(r => r.email && r.email.includes('@'));
}

function personalizeText(template: string, r: Recipient): string {
  const initials = ((r.firstName?.[0] || '') + (r.lastName?.[0] || '')).toUpperCase() || r.email.slice(0, 2).toUpperCase();
  return template
    .replace(/\{\{name\}\}/gi, r.name || r.email)
    .replace(/\{\{first_name\}\}/gi, r.firstName || r.name?.split(' ')[0] || '')
    .replace(/\{\{last_name\}\}/gi, r.lastName || '')
    .replace(/\{\{email\}\}/gi, r.email)
    .replace(/\{\{initials\}\}/gi, initials);
}

function CampaignAnalytics() {
  const { user } = useAuth();
  const { locale } = useI18n();
  const da = locale === 'da';

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['bulk-email-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bulk_email_campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 10000,
  });

  const { data: recipients = [] } = useQuery({
    queryKey: ['bulk-email-recipients', selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bulk_email_recipients')
        .select('*')
        .eq('campaign_id', selectedCampaignId!)
        .order('opened_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 10000,
  });

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);

  // Build open timeline data for chart
  const openTimelineData = (() => {
    if (!recipients.length) return [];
    const opened = recipients.filter((r) => r.opened_at);
    if (!opened.length) return [];

    // Group by hour
    const groups: Record<string, number> = {};
    opened.forEach((r) => {
      const d = new Date(r.opened_at);
      const key = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
      groups[key] = (groups[key] || 0) + 1;
    });

    // Cumulative
    let cumulative = 0;
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, count]) => {
        cumulative += count;
        return { time, opens: count, cumulative };
      });
  })();

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">{da ? 'Indlæser...' : 'Loading...'}</div>;

  if (selectedCampaignId && selectedCampaign) {
    const openRate = selectedCampaign.total_sent > 0
      ? ((selectedCampaign.total_opened / selectedCampaign.total_sent) * 100).toFixed(1)
      : '0';
    const unsubRate = selectedCampaign.total_sent > 0
      ? ((selectedCampaign.total_unsubscribed / selectedCampaign.total_sent) * 100).toFixed(1)
      : '0';
    const repliedCount = selectedCampaign.total_replied || 0;
    const replyRate = selectedCampaign.total_sent > 0
      ? ((repliedCount / selectedCampaign.total_sent) * 100).toFixed(1)
      : '0';

    const openedRecipients = recipients.filter((r) => r.opened_at);
    const unsubscribedRecipients = recipients.filter((r) => r.unsubscribed_at);
    const repliedRecipients = recipients.filter((r) => r.replied_at);

    const handleMarkReplied = async (recipientId: string, campaignId: string) => {
      const rec = recipients.find((r) => r.id === recipientId);
      if (rec?.replied_at) return;
      await supabase.from('bulk_email_recipients').update({ replied_at: new Date().toISOString() }).eq('id', recipientId);
      await supabase.rpc('increment_campaign_replies', { p_campaign_id: campaignId });
      toast.success(da ? 'Markeret som svaret' : 'Marked as replied');
    };

    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedCampaignId(null)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> {da ? 'Tilbage til kampagner' : 'Back to campaigns'}
        </Button>

        <div>
          <h2 className="text-lg font-semibold">{selectedCampaign.subject}</h2>
          <p className="text-sm text-muted-foreground">
            {da ? 'Sendt' : 'Sent'}: {new Date(selectedCampaign.created_at).toLocaleString(locale)}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="py-4 text-center">
              <Mail className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">{selectedCampaign.total_sent}</p>
              <p className="text-xs text-muted-foreground">{da ? 'Sendt' : 'Sent'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <MailOpen className="h-5 w-5 mx-auto mb-1 text-green-500" />
              <p className="text-2xl font-bold">{selectedCampaign.total_opened}</p>
              <p className="text-xs text-muted-foreground">{da ? 'Åbnet' : 'Opened'} ({openRate}%)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <MessageSquareReply className="h-5 w-5 mx-auto mb-1 text-blue-500" />
              <p className="text-2xl font-bold">{repliedCount}</p>
              <p className="text-xs text-muted-foreground">{da ? 'Svaret' : 'Replied'} ({replyRate}%)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <UserX className="h-5 w-5 mx-auto mb-1 text-destructive" />
              <p className="text-2xl font-bold">{selectedCampaign.total_unsubscribed}</p>
              <p className="text-xs text-muted-foreground">{da ? 'Afmeldt' : 'Unsubscribed'} ({unsubRate}%)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
              <p className="text-2xl font-bold">{selectedCampaign.total_errors}</p>
              <p className="text-xs text-muted-foreground">{da ? 'Fejl' : 'Errors'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Open rate curve */}
        {openTimelineData.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> {da ? 'Åbningsrate over tid' : 'Open rate over time'}</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={openTimelineData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <Tooltip />
                    <Line type="monotone" dataKey="cumulative" name={da ? 'Total åbnet' : 'Total opened'} className="stroke-primary" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="opens" name={da ? 'Åbninger' : 'Opens'} className="stroke-green-500" strokeWidth={1} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Opened recipients list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MailOpen className="h-4 w-4 text-green-500" />
              {da ? `Har åbnet (${openedRecipients.length})` : `Opened (${openedRecipients.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {openedRecipients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{da ? 'Ingen har åbnet endnu' : 'No opens yet'}</p>
            ) : (
              <ScrollArea className="h-[300px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium">{da ? 'Navn' : 'Name'}</th>
                      <th className="text-left py-2 px-2 font-medium">Email</th>
                      <th className="text-left py-2 px-2 font-medium">{da ? 'Åbnet' : 'Opened'}</th>
                      <th className="text-left py-2 px-2 font-medium">{da ? 'Gange' : 'Times'}</th>
                      <th className="text-right py-2 px-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {openedRecipients.map((r) => (
                      <tr key={r.id} className="border-b border-muted">
                        <td className="py-1.5 px-2">{r.name || '–'}</td>
                        <td className="py-1.5 px-2 text-muted-foreground">{r.email}</td>
                        <td className="py-1.5 px-2 text-muted-foreground text-xs">{new Date(r.opened_at).toLocaleString(locale)}</td>
                        <td className="py-1.5 px-2"><Badge variant="secondary">{r.open_count}x</Badge></td>
                        <td className="py-1.5 px-2 text-right">
                          {r.replied_at ? (
                            <Badge variant="default" className="bg-blue-500 text-white text-xs">{da ? 'Svaret' : 'Replied'}</Badge>
                          ) : (
                            <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => handleMarkReplied(r.id, selectedCampaign.id)}>
                              <MessageSquareReply className="h-3 w-3 mr-1" /> {da ? 'Markér svaret' : 'Mark replied'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Unsubscribed recipients */}
        {unsubscribedRecipients.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserX className="h-4 w-4 text-destructive" />
                {da ? `Afmeldte (${unsubscribedRecipients.length})` : `Unsubscribed (${unsubscribedRecipients.length})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium">{da ? 'Navn' : 'Name'}</th>
                      <th className="text-left py-2 px-2 font-medium">Email</th>
                      <th className="text-left py-2 px-2 font-medium">{da ? 'Afmeldt' : 'Unsubscribed'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unsubscribedRecipients.map((r) => (
                      <tr key={r.id} className="border-b border-muted">
                        <td className="py-1.5 px-2">{r.name || '–'}</td>
                        <td className="py-1.5 px-2 text-muted-foreground">{r.email}</td>
                        <td className="py-1.5 px-2 text-muted-foreground text-xs">{new Date(r.unsubscribed_at).toLocaleString(locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Replied recipients */}
        {repliedRecipients.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquareReply className="h-4 w-4 text-blue-500" />
                {da ? `Har svaret (${repliedRecipients.length})` : `Replied (${repliedRecipients.length})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium">{da ? 'Navn' : 'Name'}</th>
                      <th className="text-left py-2 px-2 font-medium">Email</th>
                      <th className="text-left py-2 px-2 font-medium">{da ? 'Svaret' : 'Replied'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repliedRecipients.map((r) => (
                      <tr key={r.id} className="border-b border-muted">
                        <td className="py-1.5 px-2">{r.name || '–'}</td>
                        <td className="py-1.5 px-2 text-muted-foreground">{r.email}</td>
                        <td className="py-1.5 px-2 text-muted-foreground text-xs">{new Date(r.replied_at).toLocaleString(locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Campaign list
  return (
    <div className="space-y-4">
      {campaigns.length === 0 ? (
        <div className="text-center py-12">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">{da ? 'Ingen kampagner sendt endnu' : 'No campaigns sent yet'}</p>
          <p className="text-sm text-muted-foreground/70">{da ? 'Send din første masse-email for at se statistik her' : 'Send your first bulk email to see stats here'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => {
            const openRate = c.total_sent > 0 ? ((c.total_opened / c.total_sent) * 100).toFixed(1) : '0';
            return (
              <Card key={c.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setSelectedCampaignId(c.id)}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.subject}</p>
                      <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString(locale)}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <p className="font-semibold">{c.total_sent}</p>
                        <p className="text-xs text-muted-foreground">{da ? 'Sendt' : 'Sent'}</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-green-500">{openRate}%</p>
                        <p className="text-xs text-muted-foreground">{da ? 'Åbnet' : 'Opened'}</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-destructive">{c.total_unsubscribed}</p>
                        <p className="text-xs text-muted-foreground">{da ? 'Afmeldt' : 'Unsub'}</p>
                      </div>
                      <Badge variant={c.status === 'completed' ? 'secondary' : 'default'}>
                        {c.status === 'completed' ? (da ? 'Fuldført' : 'Completed') : (da ? 'Sender...' : 'Sending...')}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BulkEmailPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { data: gmailAccount, isLoading: gmailLoading } = useGmailAccount();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, total: 0, errors: 0 });
  const [tab, setTab] = useState('compose');
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [includeUnsubscribe, setIncludeUnsubscribe] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyStats, setVerifyStats] = useState<{ valid: number; invalid: number; unverified?: number } | null>(null);

  const MAX_RECIPIENTS = 2000;
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  const verifyEmails = useCallback(async (recipientsToVerify: Recipient[]) => {
    if (!recipientsToVerify.length) return;
    setVerifying(true);
    setVerifyStats(null);
    try {
      const { data, error } = await supabase.functions.invoke('verify-emails', {
        body: { emails: recipientsToVerify.map(r => r.email) },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      const results: { email: string; valid: boolean; reason: string; status?: string }[] = data.results;
      const resultMap = new Map(results.map(r => [r.email, r]));
      setRecipients(prev => prev.map(r => {
        const vr = resultMap.get(r.email);
        // Only mark as invalid if status is explicitly "invalid", not for unverified/timeout
        const isInvalid = vr?.status === 'invalid';
        return { ...r, verified: isInvalid ? false : (vr?.status === 'verified' ? true : null), verifyReason: vr?.reason || '' };
      }));
      setVerifyStats(data.summary);
      const inv = data.summary.invalid;
      const unv = data.summary.unverified || 0;
      if (inv > 0) {
        toast.warning(locale === 'da' ? `${inv} ugyldig(e) email(s) fundet — fjern dem eller fortsæt` : `${inv} invalid email(s) found — remove them or continue`);
      } else if (unv > 0) {
        toast.info(locale === 'da' ? `${data.summary.valid} verificeret, ${unv} kunne ikke tjekkes (du kan stadig sende)` : `${data.summary.valid} verified, ${unv} could not be checked (you can still send)`);
      } else {
        toast.success(locale === 'da' ? 'Alle emails verificeret ✓' : 'All emails verified ✓');
      }
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }, [locale]);

  const removeInvalidEmails = () => {
    const valid = recipients.filter(r => r.verified !== false);
    const removed = recipients.length - valid.length;
    setRecipients(valid);
    setVerifyStats(null);
    toast.success(locale === 'da' ? `${removed} ugyldige fjernet` : `${removed} invalid removed`);
  };

  const handleCSVDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) readCSV(file);
  }, []);

  const readCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast.error(t('bulkEmail.csvError'));
        return;
      }
      let finalRecipients = parsed;
      if (parsed.length > MAX_RECIPIENTS) {
        toast.warning(t('bulkEmail.maxRecipientsWarning').replace('{max}', String(MAX_RECIPIENTS)));
        finalRecipients = parsed.slice(0, MAX_RECIPIENTS);
      }
      setRecipients(finalRecipients);
      toast.success(t('bulkEmail.recipientsImported').replace('{count}', String(finalRecipients.length)));
      // Auto-verify emails after import
      verifyEmails(finalRecipients);
    };
    reader.readAsText(file);
  };

  const handleAttachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} ${t('bulkEmail.fileTooLarge')}`); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setAttachments(prev => [...prev, { filename: file.name, content_type: file.type || 'application/octet-stream', data: base64, size: file.size }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeAttachment = (idx: number) => setAttachments(prev => prev.filter((_, i) => i !== idx));

  const sendBulkEmails = async () => {
    setConfirmSendOpen(false);
    if (!recipients.length || !subject.trim() || !body.trim()) { toast.error(t('bulkEmail.fillFields')); return; }
    if (!gmailAccount) { toast.error(t('bulkEmail.connectFirst')); return; }

    setSending(true);
    setProgress({ sent: 0, total: recipients.length, errors: 0 });

    // Create campaign record
    const companyId = user?.company_id;
    const userId = user?.user_id;
    if (!companyId || !userId) { toast.error('Missing company context'); setSending(false); return; }

    const campaignId = crypto.randomUUID();
    await supabase.from('bulk_email_campaigns').insert({
      id: campaignId,
      company_id: companyId,
      user_id: userId,
      subject: subject,
      body_preview: body.slice(0, 200),
      total_recipients: recipients.length,
      status: 'sending',
    });

    let sent = 0;
    let errors = 0;
    const batchSize = 5;
    const delayMs = 1500;

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const promises = batch.map(async (r) => {
        // Create recipient record first
        const recipientId = crypto.randomUUID();
        await supabase.from('bulk_email_recipients').insert({
          id: recipientId,
          campaign_id: campaignId,
          company_id: companyId,
          email: r.email,
          name: r.name || null,
          status: 'sending',
        });

        try {
          const personalSubject = personalizeText(subject, r);
          const personalBody = personalizeText(body, r);

          // Build HTML with tracking pixel
          const trackingPixelUrl = `${SUPABASE_URL}/functions/v1/email-track?rid=${recipientId}`;
          const unsubUrl = `${SUPABASE_URL}/functions/v1/email-track?unsub=${recipientId}`;

          let htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222;">${personalBody
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>')}`;

          if (includeUnsubscribe) {
            htmlBody += `<br><br><hr style="border:none;border-top:1px solid #ddd;margin:20px 0;"><p style="font-size:12px;color:#999;"><a href="${unsubUrl}" style="color:#999;">Klik her for at afmelde</a></p>`;
          }

          // Add tracking pixel
          htmlBody += `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
          htmlBody += `</body></html>`;

          const payload: { to: string; subject: string; message: string; html: string; attachments?: Attachment[] } = {
            to: r.email,
            subject: personalSubject,
            message: personalBody,
            html: htmlBody,
          };
          if (attachments.length > 0) payload.attachments = attachments;

          const { data, error } = await supabase.functions.invoke('gmail-send', { body: payload });
          if (error || data?.error) throw new Error(data?.error || error?.message);

          await supabase.from('bulk_email_recipients').update({ status: 'sent' }).eq('id', recipientId);
          sent++;
        } catch (err) {
          await supabase.from('bulk_email_recipients').update({
            status: 'error',
            error_message: getErrorMessage(err) || 'Unknown error',
          }).eq('id', recipientId);
          errors++;
        }
      });
      await Promise.all(promises);
      setProgress({ sent, total: recipients.length, errors });
      if (i + batchSize < recipients.length) await new Promise(res => setTimeout(res, delayMs));
    }

    // Update campaign totals
    await supabase.from('bulk_email_campaigns').update({
      total_sent: sent,
      total_errors: errors,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', campaignId);

    setSending(false);
    if (errors === 0) toast.success(t('bulkEmail.allSent').replace('{count}', String(sent)));
    else toast.warning(t('bulkEmail.sentWithErrors').replace('{sent}', String(sent)).replace('{errors}', String(errors)));
  };

  const previewRecipient = recipients[0] || { email: 'kontakt@firma.dk', name: 'Hans Jensen', firstName: 'Hans', lastName: 'Jensen' };

  if (gmailLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Send className="h-6 w-6 text-primary" /> {t('bulkEmail.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('bulkEmail.subtitle').replace('{max}', String(MAX_RECIPIENTS))}</p>
      </div>

      {!gmailAccount && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="py-4">
            <p className="text-sm text-destructive font-medium">⚠️ {t('bulkEmail.connectFirst')}</p>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="compose">✏️ {t('bulkEmail.tabCompose')}</TabsTrigger>
          <TabsTrigger value="recipients">👥 {t('bulkEmail.tabRecipients')} ({recipients.length})</TabsTrigger>
          <TabsTrigger value="preview">👁️ {t('bulkEmail.tabPreview')}</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> {locale === 'da' ? 'Statistik' : 'Analytics'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-4">
          {/* CSV Import */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> {t('bulkEmail.importRecipients')}</CardTitle></CardHeader>
            <CardContent>
              <div
                className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleCSVDrop}
                onClick={() => csvInputRef.current?.click()}
              >
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm font-medium">{t('bulkEmail.dropCsv')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('bulkEmail.csvHelp')}</p>
                {recipients.length > 0 && !verifying && <Badge variant="secondary" className="mt-3">{recipients.length} {t('bulkEmail.imported')}</Badge>}
                {verifying && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {locale === 'da' ? 'Verificerer emails via SMTP...' : 'Verifying emails via SMTP...'}
                  </div>
                )}
              </div>
              <input ref={csvInputRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={(e) => e.target.files?.[0] && readCSV(e.target.files[0])} />
              {verifyStats && (
                <div className="mt-3 flex gap-3 items-center flex-wrap">
                  <Badge variant="secondary" className="gap-1"><ShieldCheck className="h-3 w-3 text-green-500" /> {verifyStats.valid} {locale === 'da' ? 'verificeret' : 'verified'}</Badge>
                  {(verifyStats.unverified || 0) > 0 && (
                    <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3 text-yellow-500" /> {verifyStats.unverified} {locale === 'da' ? 'ikke tjekket' : 'unchecked'}</Badge>
                  )}
                  {verifyStats.invalid > 0 && (
                    <>
                      <Badge variant="destructive" className="gap-1"><ShieldX className="h-3 w-3" /> {verifyStats.invalid} {locale === 'da' ? 'ugyldige' : 'invalid'}</Badge>
                      <Button variant="destructive" size="sm" onClick={removeInvalidEmails}>
                        {locale === 'da' ? 'Fjern ugyldige' : 'Remove invalid'}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subject & Body */}
          <Card>
            <CardHeader><CardTitle className="text-base">{t('bulkEmail.emailContent')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="subject">{t('bulkEmail.subjectLabel')}</Label>
                <Input id="subject" placeholder={t('bulkEmail.subjectPlaceholder')} value={subject} onChange={e => setSubject(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="body">{t('bulkEmail.bodyLabel')}</Label>
                <Textarea id="body" rows={10} placeholder={t('bulkEmail.bodyPlaceholder')} value={body} onChange={e => setBody(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <p className="text-xs text-muted-foreground w-full">{t('bulkEmail.useVariables')}:</p>
                {['{{name}}', '{{first_name}}', '{{last_name}}', '{{email}}', '{{initials}}'].map(v => (
                  <Badge key={v} variant="outline" className="cursor-pointer text-xs" onClick={() => setBody(prev => prev + ' ' + v)}>{v}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Paperclip className="h-4 w-4" /> {t('bulkEmail.attachments')}</CardTitle></CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> {t('bulkEmail.addFile')}
              </Button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleAttachFile} />
              <p className="text-xs text-muted-foreground mt-1">{t('bulkEmail.maxFileSize')}</p>
              {attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {attachments.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{a.filename}</span>
                      <span className="text-xs text-muted-foreground">{(a.size / 1024).toFixed(0)} KB</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeAttachment(i)}><X className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Options */}
          <Card>
            <CardHeader><CardTitle className="text-base">{t('bulkEmail.options')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t('bulkEmail.unsubscribeLink')}</p>
                  <p className="text-xs text-muted-foreground">{t('bulkEmail.unsubscribeDesc')}</p>
                </div>
                <Switch checked={includeUnsubscribe} onCheckedChange={setIncludeUnsubscribe} />
              </div>
            </CardContent>
          </Card>

          {/* Send */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-medium">{recipients.length} {t('bulkEmail.recipientsLabel')} · {attachments.length} {t('bulkEmail.attachmentsLabel')}</p>
                  {sending && (
                    <div className="mt-2">
                      <div className="h-2 w-64 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress.total ? (progress.sent / progress.total) * 100 : 0}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {progress.sent}/{progress.total} {t('bulkEmail.sentLabel')}{progress.errors > 0 ? ` · ${progress.errors} ${t('bulkEmail.errorsLabel')}` : ''}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!subject.trim() || !body.trim()) { toast.error(locale === 'da' ? 'Udfyld emne og brødtekst først' : 'Fill in subject and body first'); return; }
                      if (!gmailAccount) { toast.error(t('bulkEmail.connectFirst')); return; }
                      const { data: { user: authUser } } = await supabase.auth.getUser();
                      if (!authUser?.email) { toast.error('No email found'); return; }
                      try {
                        const testRecipient: Recipient = { email: authUser.email, name: user?.full_name || '', firstName: user?.full_name?.split(' ')[0] || '', lastName: user?.full_name?.split(' ').slice(1).join(' ') || '' };
                        await supabase.functions.invoke('gmail-send', {
                          body: { to: authUser.email, subject: personalizeText(subject, testRecipient), message: personalizeText(body, testRecipient) },
                        });
                        toast.success(locale === 'da' ? `Test-email sendt til ${authUser.email}` : `Test email sent to ${authUser.email}`);
                      } catch { toast.error(locale === 'da' ? 'Kunne ikke sende test-email' : 'Failed to send test email'); }
                    }}
                    disabled={sending || !subject.trim() || !body.trim() || !gmailAccount}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {locale === 'da' ? 'Send test til mig' : 'Send test to me'}
                  </Button>
                  <Button onClick={() => setConfirmSendOpen(true)} disabled={sending || !recipients.length || !subject.trim() || !body.trim() || !gmailAccount} size="lg">
                    <Send className="h-4 w-4 mr-2" />
                    {sending ? `${t('bulkEmail.sending')} (${progress.sent}/${progress.total})...` : `${t('bulkEmail.sendBtn')} ${recipients.length} ${t('bulkEmail.emails')}`}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recipients">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>{t('bulkEmail.recipientList')}</span>
                <div className="flex items-center gap-2">
                  {recipients.length > 0 && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => verifyEmails(recipients)} disabled={verifying}>
                        {verifying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
                        {locale === 'da' ? 'Verificér emails' : 'Verify emails'}
                      </Button>
                      {verifyStats && verifyStats.invalid > 0 && (
                        <Button variant="destructive" size="sm" onClick={removeInvalidEmails}>
                          <ShieldX className="h-4 w-4 mr-1" />
                          {locale === 'da' ? `Fjern ${verifyStats.invalid} ugyldige` : `Remove ${verifyStats.invalid} invalid`}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => { setRecipients([]); setVerifyStats(null); }}><X className="h-4 w-4 mr-1" /> {t('bulkEmail.clearList')}</Button>
                    </>
                  )}
                </div>
              </CardTitle>
              {verifyStats && (
                <div className="flex gap-3 text-sm mt-2">
                  <Badge variant="secondary" className="gap-1"><ShieldCheck className="h-3 w-3 text-green-500" /> {verifyStats.valid} {locale === 'da' ? 'gyldige' : 'valid'}</Badge>
                  {verifyStats.invalid > 0 && <Badge variant="destructive" className="gap-1"><ShieldX className="h-3 w-3" /> {verifyStats.invalid} {locale === 'da' ? 'ugyldige' : 'invalid'}</Badge>}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {recipients.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t('bulkEmail.noRecipients')}</p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium">#</th>
                        <th className="text-left py-2 px-2 font-medium">{t('common.name')}</th>
                        <th className="text-left py-2 px-2 font-medium">{t('common.email')}</th>
                        <th className="text-left py-2 px-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.map((r, i) => (
                        <tr key={i} className={`border-b border-muted ${r.verified === false ? 'bg-destructive/5' : ''}`}>
                          <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                          <td className="py-1.5 px-2">{r.name || '–'}</td>
                          <td className="py-1.5 px-2 text-muted-foreground">{r.email}</td>
                          <td className="py-1.5 px-2">
                            {r.verified === true && <Badge variant="secondary" className="text-xs gap-1"><ShieldCheck className="h-3 w-3 text-green-500" /> OK</Badge>}
                            {r.verified === false && (
                              <Badge variant="destructive" className="text-xs gap-1">
                                <ShieldX className="h-3 w-3" /> {r.verifyReason || 'Invalid'}
                              </Badge>
                            )}
                            {r.verified == null && <span className="text-xs text-muted-foreground">–</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" /> {t('bulkEmail.previewTitle')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    {((previewRecipient.firstName?.[0] || '') + (previewRecipient.lastName?.[0] || '')).toUpperCase() || '??'}
                  </div>
                  <div>
                    <p className="font-medium">{previewRecipient.name || previewRecipient.email}</p>
                    <p className="text-xs text-muted-foreground">{previewRecipient.email}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('bulkEmail.subjectLabel')}:</p>
                    <p className="font-medium">{personalizeText(subject || `(${t('bulkEmail.emptySubject')})`, previewRecipient)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('bulkEmail.bodyLabel')}:</p>
                    <div className="whitespace-pre-wrap text-sm mt-1 bg-background rounded p-3 border">
                      {personalizeText(body || `(${t('bulkEmail.emptyBody')})`, previewRecipient)}
                      {includeUnsubscribe && <p className="text-xs text-muted-foreground mt-4 pt-2 border-t">---<br/>{t('bulkEmail.unsubscribeText')}</p>}
                    </div>
                  </div>
                  {attachments.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t('bulkEmail.attachments')}:</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {attachments.map((a, i) => (
                          <Badge key={i} variant="secondary"><Paperclip className="h-3 w-3 mr-1" />{a.filename}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <CampaignAnalytics />
        </TabsContent>
      </Tabs>

      {/* Confirm send dialog (GDPR compliance check) */}
      <Dialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-yellow-500" />{t('bulkEmail.confirmSendTitle')}</DialogTitle>
            <DialogDescription>{t('bulkEmail.confirmSendDesc').replace('{count}', String(recipients.length))}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${includeUnsubscribe ? 'text-accent' : 'text-destructive'}`} />
              <p>{t('bulkEmail.unsubscribeLinkIncluded')}: <strong>{includeUnsubscribe ? t('common.yes') : t('common.no')}</strong></p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">{t('bulkEmail.consentReminder')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSendOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={sendBulkEmails}>
              <Send className="h-4 w-4 mr-2" />{t('bulkEmail.confirmSend')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
