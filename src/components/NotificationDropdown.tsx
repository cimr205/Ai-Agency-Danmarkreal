import { Bell, Check, CheckCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/hooks/api/useNotifications';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { da } from 'date-fns/locale';
import { useI18n } from '@/lib/i18n';

export default function NotificationDropdown() {
  const { data: notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative rounded-full border border-border bg-card/60 p-2">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">{t('common.notifications')}</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => markAllRead.mutate()}>
              <CheckCheck className="h-3 w-3" /> {t('common.markAllRead')}
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {(!notifications || notifications.length === 0) ? (
            <p className="p-4 text-sm text-muted-foreground text-center">{t('common.noNotifications')}</p>
          ) : (
            notifications.map(n => (
              <button
                key={n.id}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors ${!n.read ? 'bg-primary/5' : ''}`}
                onClick={() => {
                  if (!n.read) markRead.mutate(n.id);
                  if (n.link) navigate(n.link);
                }}
              >
                <div className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                  <div className={!n.read ? '' : 'ml-4'}>
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.message && <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: da })}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
