import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { da, de, enUS } from 'date-fns/locale';
import { MessageSquarePlus, MessagesSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useI18n, isLocale } from '@/lib/i18n';
import {
  useConversations, useSendMessage, useMarkConversationRead,
  useMarkMessageUnread, type Conversation,
} from '@/hooks/api/useInbox';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationList } from '@/components/inbox/ConversationList';
import { ConversationThread } from '@/components/inbox/ConversationThread';
import { ConversationDetailsPanel } from '@/components/inbox/ConversationDetailsPanel';
import { NewConversationDialog } from '@/components/inbox/NewConversationDialog';

const localeMap = { da, de, en: enUS };

export default function InboxPage() {
  const { t } = useI18n();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const dateFnsLocale = localeMap[locale] || enUS;
  const { profile } = useAuth();
  const userId = profile?.user_id;

  const { conversations, isLoading, error, togglePin, colleagues } = useConversations();
  const sendMessage = useSendMessage();
  const markConversationRead = useMarkConversationRead();
  const markMessageUnread = useMarkMessageUnread();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(true);
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');

  const selected: Conversation | undefined = useMemo(
    () => conversations.find((c) => c.participant.user_id === selectedId),
    [conversations, selectedId]
  );

  const unreadTotal = useMemo(() => conversations.reduce((sum, c) => sum + c.unreadCount, 0), [conversations]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setMobileView('thread');
    if (userId) {
      const convo = conversations.find((c) => c.participant.user_id === id);
      if (convo && convo.unreadCount > 0) {
        markConversationRead.mutate({ otherUserId: id, userId });
      }
    }
  };

  const handleSend = async (content: string) => {
    if (!selectedId) return;
    await sendMessage.mutateAsync({ receiver_id: selectedId, content });
  };

  const handleStartConversation = async (receiverId: string, content: string) => {
    await sendMessage.mutateAsync({ receiver_id: receiverId, content });
    setSelectedId(receiverId);
    setMobileView('thread');
  };

  const handleMarkUnread = () => {
    if (!selected) return;
    const lastFromThem = [...selected.messages].reverse().find((m) => m.sender_id === selected.participant.user_id);
    if (lastFromThem) {
      markMessageUnread.mutate(lastFromThem.id, {
        onError: () => toast.error(t('pages.inbox.sendError')),
      });
    }
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[600px] flex-col space-y-4 pb-2">
      <PageHeader
        eyebrow={t('nav.communication') || 'Communication'}
        title={t('pages.inbox.title')}
        description={t('pages.inbox.subtitle')}
        stats={[{ value: unreadTotal, label: t('pages.inbox.filterUnread') }]}
        actions={
          <button
            type="button"
            onClick={() => setIsNewOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <MessageSquarePlus className="h-4 w-4" />
            {t('pages.inbox.newConversation')}
          </button>
        }
      />

      {isLoading ? (
        <div className="grid flex-1 grid-cols-[320px_1fr] gap-4">
          <div className="space-y-3 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-3 w-40" /></div>
              </div>
            ))}
          </div>
          <Skeleton className="h-full w-full rounded-xl" />
        </div>
      ) : error ? (
        <EmptyState icon={MessagesSquare} title={t('pages.inbox.loadError')} />
      ) : (
        <>
          {/* Desktop 3-panel — dark list panel + rounded frame, matching the workspace design language */}
          <div
            className="hidden flex-1 gap-[10px] overflow-hidden rounded-[32px] bg-workspace-frame p-2 lg:grid"
            style={{ gridTemplateColumns: isDetailsOpen && selected ? '320px 1fr 300px' : '320px 1fr' }}
          >
            <div className="flex flex-col overflow-hidden rounded-[22px] bg-workspace-panel">
              <ConversationList
                conversations={conversations}
                selectedId={selectedId}
                onSelect={handleSelect}
                search={search}
                onSearchChange={setSearch}
                filter={filter}
                onFilterChange={setFilter}
                currentUserId={userId}
                dateFnsLocale={dateFnsLocale}
                onNewConversation={() => setIsNewOpen(true)}
              />
            </div>
            <div className="flex flex-col overflow-hidden rounded-[22px] bg-background">
              {selected && userId ? (
                <ConversationThread
                  conversation={selected}
                  currentUserId={userId}
                  dateFnsLocale={dateFnsLocale}
                  onSend={handleSend}
                  onMarkUnread={handleMarkUnread}
                  onTogglePin={() => togglePin(selected.participant.user_id)}
                  onToggleDetails={() => setIsDetailsOpen((v) => !v)}
                  isDetailsOpen={isDetailsOpen}
                />
              ) : (
                <EmptyState
                  bare
                  icon={MessagesSquare}
                  title={t('pages.inbox.emptyNoSelectionTitle')}
                  hint={t('pages.inbox.emptyNoSelectionHint')}
                  action={{ label: t('pages.inbox.newConversation'), onClick: () => setIsNewOpen(true), icon: MessageSquarePlus }}
                />
              )}
            </div>
            {selected && isDetailsOpen && (
              <div className="hidden overflow-y-auto rounded-[22px] bg-background xl:block">
                <ConversationDetailsPanel conversation={selected} dateFnsLocale={dateFnsLocale} />
              </div>
            )}
          </div>

          {/* Mobile: list or thread */}
          <div className={cn(
            'flex-1 overflow-hidden rounded-[22px] lg:hidden',
            mobileView === 'list' || !selected || !userId ? 'bg-workspace-panel' : 'border border-border/30 bg-background',
          )}>
            {mobileView === 'list' || !selected || !userId ? (
              <ConversationList
                conversations={conversations}
                selectedId={selectedId}
                onSelect={handleSelect}
                search={search}
                onSearchChange={setSearch}
                filter={filter}
                onFilterChange={setFilter}
                currentUserId={userId}
                dateFnsLocale={dateFnsLocale}
                onNewConversation={() => setIsNewOpen(true)}
              />
            ) : (
              <ConversationThread
                conversation={selected}
                currentUserId={userId}
                dateFnsLocale={dateFnsLocale}
                onSend={handleSend}
                onMarkUnread={handleMarkUnread}
                onTogglePin={() => togglePin(selected.participant.user_id)}
                onToggleDetails={() => setIsDetailsOpen((v) => !v)}
                isDetailsOpen={isDetailsOpen}
                onBack={() => setMobileView('list')}
              />
            )}
          </div>
        </>
      )}

      <NewConversationDialog
        open={isNewOpen}
        onOpenChange={setIsNewOpen}
        colleagues={colleagues}
        currentUserId={userId}
        onStart={handleStartConversation}
      />
    </div>
  );
}
