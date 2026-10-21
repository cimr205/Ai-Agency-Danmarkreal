import { useEffect, useMemo, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Pin, PinOff, MailX, PanelRightOpen, PanelRightClose, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isSameDay } from 'date-fns';
import type { Locale } from 'date-fns';
import type { Conversation } from '@/hooks/api/useInbox';
import { MessageComposer } from './MessageComposer';
import { getInitials, displayName } from './utils';
import { useI18n } from '@/lib/i18n';

export function ConversationThread({
  conversation,
  currentUserId,
  dateFnsLocale,
  onSend,
  onMarkUnread,
  onTogglePin,
  onToggleDetails,
  isDetailsOpen,
  onBack,
}: {
  conversation: Conversation;
  currentUserId: string;
  dateFnsLocale: Locale;
  onSend: (content: string) => Promise<void>;
  onMarkUnread: () => void;
  onTogglePin: () => void;
  onToggleDetails: () => void;
  isDetailsOpen: boolean;
  onBack?: () => void;
}) {
  const { t } = useI18n();
  const bottomRef = useRef<HTMLDivElement>(null);
  const { participant, messages } = conversation;
  const name = displayName(participant.full_name, participant.email, t('pages.inbox.unknownColleague'));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, conversation.participant.user_id]);

  const groups = useMemo(() => {
    const out: { date: string; items: typeof messages }[] = [];
    for (const m of messages) {
      const dateKey = format(new Date(m.created_at), 'yyyy-MM-dd');
      const lastGroup = out[out.length - 1];
      if (lastGroup && lastGroup.date === dateKey) lastGroup.items.push(m);
      else out.push({ date: dateKey, items: [m] });
    }
    return out;
  }, [messages]);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        {onBack && (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 lg:hidden" onClick={onBack} aria-label={t('pages.inbox.back')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={participant.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-xs text-primary">{getInitials(participant.full_name, participant.email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          {participant.email && <p className="truncate text-xs text-muted-foreground">{participant.email}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onMarkUnread} aria-label={t('pages.inbox.markUnread')}>
                <MailX className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('pages.inbox.markUnread')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onTogglePin} aria-label={conversation.pinned ? t('pages.inbox.unpinConversation') : t('pages.inbox.pinConversation')}>
                {conversation.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{conversation.pinned ? t('pages.inbox.unpinConversation') : t('pages.inbox.pinConversation')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="hidden h-8 w-8 xl:inline-flex" onClick={onToggleDetails} aria-label={t('pages.inbox.toggleDetails')}>
                {isDetailsOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('pages.inbox.toggleDetails')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {groups.map((group) => (
          <div key={group.date}>
            <div className="sticky top-0 z-10 mb-3 flex justify-center">
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {format(new Date(group.date), 'PPP', { locale: dateFnsLocale })}
              </span>
            </div>
            <div className="space-y-3">
              {group.items.map((m, idx) => {
                const isMe = m.sender_id === currentUserId;
                const prev = group.items[idx - 1];
                const isGrouped = prev && prev.sender_id === m.sender_id && isSameDay(new Date(prev.created_at), new Date(m.created_at));
                return (
                  <div key={m.id} className={cn('flex items-end gap-2', isMe ? 'flex-row-reverse' : 'flex-row', isGrouped && 'mt-1')}>
                    {!isMe && (
                      <Avatar className={cn('h-6 w-6 shrink-0', isGrouped && 'invisible')}>
                        <AvatarImage src={participant.avatar_url || undefined} />
                        <AvatarFallback className="bg-muted text-[10px]">{getInitials(participant.full_name, participant.email)}</AvatarFallback>
                      </Avatar>
                    )}
                    <div className={cn('max-w-[70%] rounded-2xl px-3 py-2 text-sm leading-relaxed', isMe ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted text-foreground')}>
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      <p className={cn('mt-1 text-[10px]', isMe ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                        {format(new Date(m.created_at), 'HH:mm')}
                        {isMe && m.read && <span className="ml-1">· {t('pages.inbox.read')}</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <MessageComposer onSend={onSend} />
    </div>
  );
}
