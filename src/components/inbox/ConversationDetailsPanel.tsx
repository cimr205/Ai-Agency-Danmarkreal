import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Mail, Calendar, MessagesSquare, CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import type { Locale } from 'date-fns';
import type { Conversation } from '@/hooks/api/useInbox';
import { getInitials, displayName } from './utils';
import { useI18n } from '@/lib/i18n';

function Row({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</p>
        <p className="truncate text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function ConversationDetailsPanel({ conversation, dateFnsLocale }: { conversation: Conversation; dateFnsLocale: Locale }) {
  const { t } = useI18n();
  const { participant, messages } = conversation;
  const name = displayName(participant.full_name, participant.email, t('pages.inbox.unknownColleague'));
  const firstMessage = messages[0];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4 text-center">
        <Avatar className="mx-auto h-16 w-16">
          <AvatarImage src={participant.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-lg text-primary">{getInitials(participant.full_name, participant.email)}</AvatarFallback>
        </Avatar>
        <p className="mt-3 text-sm font-semibold text-foreground">{name}</p>
        {participant.email && <p className="truncate text-xs text-muted-foreground">{participant.email}</p>}
      </div>

      <div className="space-y-4 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{t('pages.inbox.detailsHeading')}</p>
        {participant.email && <Row icon={Mail} label={t('pages.inbox.detailsEmail')} value={participant.email} />}
        {participant.created_at && (
          <Row icon={Calendar} label={t('pages.inbox.detailsColleagueSince')} value={format(new Date(participant.created_at), 'PPP', { locale: dateFnsLocale })} />
        )}
        <Row icon={MessagesSquare} label={t('pages.inbox.detailsMessageCount')} value={String(messages.length)} />
        {firstMessage && (
          <Row icon={CalendarClock} label={t('pages.inbox.detailsFirstMessage')} value={format(new Date(firstMessage.created_at), 'PPP', { locale: dateFnsLocale })} />
        )}
      </div>
    </div>
  );
}
