import { Archive, ArrowLeft, CheckCircle2, Eye, EyeOff, Forward, Mail, Reply, ReplyAll, Shield, ShieldCheck, Sparkles, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/shared/EmptyState';
import { RelationshipChip } from '@/components/shared/RelationshipChip';
import { useI18n } from '@/lib/i18n';
import { senderColor, senderInitials } from '@/lib/emailAvatar';
import type { Email } from './EmailListPane';

interface EmailReaderPaneProps {
  email: Email | null;
  dateLocale: string;
  locale: string;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onToggleStar: () => void;
  onToggleImportant: () => void;
  onToggleRead: () => void;
  onAskAi: () => void;
  onBack?: () => void;
}

export function EmailReaderPane({
  email, dateLocale, locale, onReply, onReplyAll, onForward, onToggleStar, onToggleImportant, onToggleRead, onAskAi, onBack,
}: EmailReaderPaneProps) {
  const { t } = useI18n();

  if (!email) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <EmptyState icon={Mail} title={t('pages.email.selectEmailTitle')} hint={t('pages.email.selectEmailDesc')} bare />
      </div>
    );
  }

  const toList = Array.isArray(email.to_addresses) ? (email.to_addresses as string[]) : [];
  const ccList = Array.isArray(email.cc_addresses) ? (email.cc_addresses as string[]) : [];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-4 py-2">
        {onBack && (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack} aria-label={t('pages.email.backToList')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <ActionButton icon={Reply} label={t('pages.email.reply')} onClick={onReply} />
        <ActionButton icon={ReplyAll} label={t('pages.email.replyAll')} onClick={onReplyAll} />
        <ActionButton icon={Forward} label={t('pages.email.forward')} onClick={onForward} />
        <DisabledAction icon={Trash2} label={t('pages.email.delete')} explanation={t('pages.email.deleteNotSupported')} />
        <ActionButton
          icon={ShieldCheck}
          label={email.is_important ? t('pages.email.unmarkImportant') : t('pages.email.markImportant')}
          onClick={onToggleImportant}
          active={!!email.is_important}
        />
        <div className="ml-auto flex items-center gap-1">
          <ActionButton icon={email.is_read ? EyeOff : Eye} label={email.is_read ? t('pages.email.markUnread') : t('pages.email.markRead')} onClick={onToggleRead} />
          <ActionButton icon={Star} label={t('pages.email.starred')} onClick={onToggleStar} active={!!email.is_starred} activeClass="text-warning fill-warning" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-3 border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-semibold leading-snug text-foreground">{email.subject || t('pages.email.noSubject')}</h1>
            <span className="shrink-0 text-xs text-muted-foreground">{new Date(email.received_at).toLocaleString(dateLocale)}</span>
          </div>

          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarFallback className={`text-sm font-semibold text-white ${senderColor(email.from_address)}`}>
                {senderInitials(email.from_name, email.from_address)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-foreground">{email.from_name || email.from_address} <span className="font-normal text-muted-foreground">&lt;{email.from_address}&gt;</span></p>
              {toList.length > 0 && <p className="truncate text-xs text-muted-foreground">{t('pages.email.to')}: {toList.join(', ')}</p>}
              {ccList.length > 0 && <p className="truncate text-xs text-muted-foreground">Cc: {ccList.join(', ')}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {email.contact && <Badge variant="secondary">{locale === 'da' ? 'Kontakt' : 'Contact'}: {email.contact.name}</Badge>}
            {email.deal && <Badge variant="outline">Deal: {email.deal.title}</Badge>}
            {!email.contact && !email.deal && (
              <RelationshipChip muted value={locale === 'da' ? 'Ingen match i CRM' : 'No CRM match'} />
            )}
            {email.has_attachments && <Badge variant="outline" className="gap-1"><Archive className="h-3 w-3" />{t('pages.email.hasAttachment')}</Badge>}
          </div>

          {email.ai_suggested_todo && (
            <div className="flex items-center gap-2 rounded-lg border border-stamp/20 bg-stamp/10 p-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-stamp" />
              <p className="text-xs font-medium text-stamp">{t('pages.email.suggestedTodo')}: {email.ai_suggested_todo}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4">
          {email.body_html ? (
            // SECURITY: email body is attacker-controlled (synced from Gmail), so it must
            // never be injected via dangerouslySetInnerHTML. A sandboxed iframe with no
            // allow-scripts token neutralises <script> and inline handlers (e.g. <img onerror>),
            // preventing stored-XSS / session-token theft, while still rendering the HTML + images.
            <iframe
              title="email-body"
              sandbox=""
              referrerPolicy="no-referrer"
              className="h-[50vh] w-full rounded-md border border-border bg-white"
              srcDoc={email.body_html}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">{email.body_text || email.snippet}</pre>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onAskAi}>
            <Sparkles className="mr-1.5 h-4 w-4" />{t('pages.email.askAi')}
          </Button>
          <Button size="sm" onClick={onReply}>
            <Reply className="mr-1.5 h-4 w-4" />{t('pages.email.reply')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, active, activeClass }: { icon: typeof Reply; label: string; onClick: () => void; active?: boolean; activeClass?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={`h-8 w-8 shrink-0 ${active ? activeClass || 'text-primary' : 'text-muted-foreground'}`} onClick={onClick} aria-label={label} aria-pressed={active}>
            <Icon className={`h-4 w-4 ${active && activeClass ? 'fill-current' : ''}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent><p className="text-xs">{label}</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DisabledAction({ icon: Icon, label, explanation }: { icon: typeof Trash2; label: string; explanation: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 cursor-not-allowed text-muted-foreground/40" aria-label={label} aria-disabled="true">
            <Icon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent><p className="max-w-xs text-xs">{explanation}</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
