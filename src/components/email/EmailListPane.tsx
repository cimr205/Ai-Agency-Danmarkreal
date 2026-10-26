import { Mail, Menu, Paperclip, Plus, Search, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { senderColor, senderInitials } from '@/lib/emailAvatar';
import type { Tables } from '@/integrations/supabase/types';

export type Email = Tables<'emails'> & {
  contact?: Pick<Tables<'customers'>, 'id' | 'name' | 'email'> | null;
  deal?: Pick<Tables<'deals'>, 'id' | 'title'> | null;
};

export type ReadFilter = 'all' | 'read' | 'unread';

interface EmailListPaneProps {
  title: string;
  emails: Email[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (email: Email) => void;
  onToggleStar: (email: Email, e: React.MouseEvent) => void;
  onCompose: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  readFilter: ReadFilter;
  onReadFilterChange: (v: ReadFilter) => void;
  dateLocale: string;
  totalInFolder: number;
  onOpenFolders?: () => void;
  unreadCount: number;
  onMarkAllRead: () => void;
}

export function EmailListPane({
  title, emails, loading, selectedId, onSelect, onToggleStar, onCompose,
  search, onSearchChange, readFilter, onReadFilterChange, dateLocale, totalInFolder, onOpenFolders,
  unreadCount, onMarkAllRead,
}: EmailListPaneProps) {
  const { t } = useI18n();

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' });
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {onOpenFolders && (
            <Button variant="ghost" size="icon" className="-ml-1 h-8 w-8 shrink-0" onClick={onOpenFolders} aria-label={t('pages.email.folders')}>
              <Menu className="h-4 w-4" />
            </Button>
          )}
          <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
        </div>
        <Button size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={onCompose} aria-label={t('pages.email.compose')}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2.5 border-b border-border px-4 py-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => onSearchChange(e.target.value)} placeholder={t('pages.email.searchPlaceholder')} className="h-8 pl-8 text-sm" />
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-0.5">
          {(['all', 'read', 'unread'] as ReadFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => onReadFilterChange(f)}
              className={cn(
                'rounded-md py-1 text-xs font-medium transition-colors',
                readFilter === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {f === 'all' ? t('pages.email.all') : f === 'read' ? t('pages.email.readFilter') : t('pages.email.unread')}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <button onClick={onMarkAllRead} className="text-xs font-medium text-primary hover:underline">
            {t('pages.email.markAllRead')}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : emails.length === 0 ? (
          <EmptyState
            icon={Mail}
            title={totalInFolder === 0 ? t('pages.email.noEmailsSynced') : t('pages.email.noEmailsMatch')}
            bare
          />
        ) : (
          <ul className="divide-y divide-border">
            {emails.map((email) => {
              const isSelected = selectedId === email.id;
              return (
                <li key={email.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(email)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(email);
                      }
                    }}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none cursor-pointer',
                      isSelected && 'bg-primary/5',
                      !email.is_read && 'bg-primary/[0.03]'
                    )}
                  >
                    <Avatar className="mt-0.5 h-9 w-9 shrink-0">
                      <AvatarFallback className={cn('text-xs font-semibold text-white', senderColor(email.from_address))}>
                        {senderInitials(email.from_name, email.from_address)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {!email.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />}
                        <span className={cn('truncate text-sm', !email.is_read ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>
                          {email.from_name || email.from_address}
                        </span>
                        {email.has_attachments && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatTime(email.received_at)}</span>
                      </div>
                      <p className={cn('mt-0.5 truncate text-sm', !email.is_read ? 'font-medium text-foreground' : 'text-muted-foreground')}>{email.subject || t('pages.email.noSubject')}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{email.snippet}</p>
                    </div>
                    <button
                      onClick={(e) => onToggleStar(email, e)}
                      className="mt-0.5 shrink-0"
                      aria-label={t('pages.email.starred')}
                      aria-pressed={!!email.is_starred}
                    >
                      <Star className={cn('h-4 w-4', email.is_starred ? 'fill-warning text-warning' : 'text-muted-foreground/30 hover:text-warning')} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
