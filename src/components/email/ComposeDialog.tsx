import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

export interface ComposePayload {
  to: string;
  cc: string;
  subject: string;
  body: string;
}

interface ComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ComposeMode;
  initial: ComposePayload;
  sending: boolean;
  onSend: (payload: ComposePayload) => Promise<void> | void;
}

const MAX_RECIPIENTS = 10;

export function parseRecipients(raw: string): string[] {
  return Array.from(new Set(
    raw.split(',').map(s => s.trim()).filter(s => s.includes('@'))
  ));
}

export function ComposeDialog({ open, onOpenChange, mode, initial, sending, onSend }: ComposeDialogProps) {
  const { t } = useI18n();
  const [to, setTo] = useState(initial.to);
  const [cc, setCc] = useState(initial.cc);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);

  const titles: Record<ComposeMode, string> = {
    new: t('pages.email.composeTitle'),
    reply: t('pages.email.reply'),
    replyAll: t('pages.email.replyAll'),
    forward: t('pages.email.forwardTitle'),
  };

  const recipients = parseRecipients(to);
  const tooMany = recipients.length > MAX_RECIPIENTS;
  const canSend = recipients.length > 0 && !tooMany && subject.trim() && body.trim() && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    await onSend({ to, cc, subject, body });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titles[mode]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">{t('pages.email.toLabel')}</label>
            <Input value={to} onChange={e => setTo(e.target.value)} placeholder={t('pages.email.recipientPlaceholder')} className="mt-1" />
            {tooMany && <p className="mt-1 text-xs text-destructive">{t('pages.email.maxRecipients')}</p>}
          </div>
          {(mode === 'replyAll' || mode === 'new' || cc) && (
            <div>
              <label className="text-sm font-medium">Cc</label>
              <Input value={cc} onChange={e => setCc(e.target.value)} placeholder={t('pages.email.recipientPlaceholder')} className="mt-1" />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">{t('pages.email.subject')}</label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder={t('pages.email.subject')} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">{t('pages.email.message')}</label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder={t('pages.email.writeMessage')} rows={10} className="mt-1" autoFocus={mode !== 'new'} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('pages.email.cancel')}</Button>
          <Button onClick={handleSend} disabled={!canSend}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {recipients.length > 1 ? t('pages.email.sendToMultiple').replace('{count}', String(recipients.length)) : t('pages.email.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
