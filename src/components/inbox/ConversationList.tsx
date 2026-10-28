import { Search, Pin, MessageSquarePlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState } from '@/components/shared/EmptyState';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import type { Locale } from 'date-fns';
import type { Conversation } from '@/hooks/api/useInbox';
import { getInitials, displayName } from './utils';
import { useI18n } from '@/lib/i18n';

type FilterTab = 'all' | 'unread';

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  currentUserId,
  dateFnsLocale,
  onNewConversation,
}: {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  filter: FilterTab;
  onFilterChange: (v: FilterTab) => void;
  currentUserId: string | undefined;
  dateFnsLocale: Locale;
  onNewConversation: () => void;
}) {
  const { t } = useI18n();

  const filtered = conversations.filter((c) => {
    if (filter === 'unread' && c.unreadCount === 0) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const name = displayName(c.participant.full_name, c.participant.email, '').toLowerCase();
    const snippet = c.lastMessage.content.toLowerCase();
    return name.includes(q) || snippet.includes(q) || c.participant.email.toLowerCase().includes(q);
  });

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-white/10 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-workspace-muted-on-dark" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('pages.inbox.searchPlaceholder')}
            aria-label={t('pages.inbox.searchPlaceholder')}
            className="h-9 border-white/10 bg-workspace-panel-row pl-8 text-workspace-ink-on-dark placeholder:text-workspace-muted-on-dark"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Tabs value={filter} onValueChange={(v) => onFilterChange(v as FilterTab)}>
            <TabsList className="h-8 bg-workspace-panel-row">
              <TabsTrigger value="all" className="h-6 px-2.5 text-xs text-workspace-label-on-dark data-[state=active]:bg-white data-[state=active]:text-workspace-ink">{t('pages.inbox.filterAll')}</TabsTrigger>
              <TabsTrigger value="unread" className="h-6 px-2.5 text-xs text-workspace-label-on-dark data-[state=active]:bg-white data-[state=active]:text-workspace-ink">{t('pages.inbox.filterUnread')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <button
            type="button"
            onClick={onNewConversation}
            aria-label={t('pages.inbox.newConversation')}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 text-workspace-label-on-dark transition-colors hover:bg-workspace-panel-row hover:text-workspace-ink-on-dark"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="p-3">
            <EmptyState
              bare
              icon={MessageSquarePlus}
              title={conversations.length === 0 ? t('pages.inbox.emptyNoConversationsTitle') : t('pages.inbox.noSearchResults')}
              hint={conversations.length === 0 ? t('pages.inbox.emptyNoConversationsHint') : undefined}
              action={conversations.length === 0 ? { label: t('pages.inbox.newConversation'), onClick: onNewConversation, icon: MessageSquarePlus } : undefined}
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-1 p-2">
            {filtered.map((c) => {
              const isSelected = c.participant.user_id === selectedId;
              const isUnread = c.unreadCount > 0;
              const youPrefix = c.lastMessage.sender_id === currentUserId ? `${t('pages.inbox.you')}: ` : '';
              return (
                <li key={c.participant.user_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.participant.user_id)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-workspace-panel-row',
                      isSelected && 'bg-workspace-panel-row'
                    )}
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={c.participant.avatar_url || undefined} />
                      <AvatarFallback className="bg-workspace-accent/20 text-xs text-workspace-accent">
                        {getInitials(c.participant.full_name, c.participant.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn('truncate text-sm', isUnread ? 'font-semibold text-workspace-ink-on-dark' : 'font-medium text-workspace-label-on-dark')}>
                          {displayName(c.participant.full_name, c.participant.email, t('pages.inbox.unknownColleague'))}
                        </span>
                        <span className="shrink-0 text-[10px] text-workspace-muted-on-dark">
                          {formatDistanceToNowStrict(new Date(c.lastMessage.created_at), { addSuffix: true, locale: dateFnsLocale })}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {c.pinned && <Pin className="h-3 w-3 shrink-0 fill-current text-workspace-muted-on-dark" />}
                        <p className={cn('truncate text-xs', isUnread ? 'text-workspace-label-on-dark' : 'text-workspace-muted-on-dark')}>
                          {youPrefix}{c.lastMessage.content}
                        </p>
                        {isUnread && (
                          <Badge className="ml-auto h-4 min-w-4 shrink-0 justify-center rounded-full bg-workspace-accent px-1 text-[10px] text-white hover:bg-workspace-accent">
                            {c.unreadCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
