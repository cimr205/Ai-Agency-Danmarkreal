import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Copy, Send, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { getErrorMessage } from '@/lib/errors';

interface AIEmailWriterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  leadEmail: string;
}

export function AIEmailWriter({ open, onOpenChange, leadId, leadName, leadEmail }: AIEmailWriterProps) {
  const { t } = useI18n();
  const [tone, setTone] = useState('professional');
  const [purpose, setPurpose] = useState('cold_outreach');
  const [customContext, setCustomContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-email-writer', {
        body: { lead_id: leadId, tone, purpose, custom_context: customContext },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      toast.error((getErrorMessage(e) || t('aiEmail.generateError')));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;
    navigator.clipboard.writeText(`${t('aiEmail.subject')}: ${result.subject}\n\n${result.body}`);
    toast.success(t('common.copied'));
  };

  const openInMailto = () => {
    if (!result) return;
    window.open(`mailto:${leadEmail}?subject=${encodeURIComponent(result.subject)}&body=${encodeURIComponent(result.body)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Email Writer — {leadName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('aiEmail.purpose')}</Label>
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cold_outreach">{t('aiEmail.coldOutreach')}</SelectItem>
                  <SelectItem value="follow_up">{t('aiEmail.followUp')}</SelectItem>
                  <SelectItem value="meeting_request">{t('aiEmail.meetingRequest')}</SelectItem>
                  <SelectItem value="proposal">{t('aiEmail.proposal')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('aiEmail.tone')}</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">{t('aiEmail.professional')}</SelectItem>
                  <SelectItem value="casual">{t('aiEmail.casual')}</SelectItem>
                  <SelectItem value="urgent">{t('aiEmail.urgent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('aiEmail.extraContext')}</Label>
            <Textarea
              value={customContext}
              onChange={e => setCustomContext(e.target.value)}
              placeholder={t('aiEmail.contextPlaceholder')}
              rows={2}
            />
          </div>

          <Button onClick={generate} disabled={loading} className="w-full gap-2">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? t('aiEmail.generating') : result ? t('aiEmail.regenerate') : t('aiEmail.generate')}
          </Button>

          {loading && (
            <div className="space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <div>
                <Label className="text-xs text-muted-foreground">{t('aiEmail.subject')}</Label>
                <p className="font-medium text-sm mt-1">{result.subject}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('aiEmail.emailBody')}</Label>
                <div className="mt-1 text-sm whitespace-pre-wrap leading-relaxed">{result.body}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-2">
                  <Copy className="h-3.5 w-3.5" /> {t('common.copy')}
                </Button>
                <Button size="sm" onClick={openInMailto} className="gap-2">
                  <Send className="h-3.5 w-3.5" /> {t('aiEmail.openInEmail')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
