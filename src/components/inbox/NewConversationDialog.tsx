import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationParticipant } from '@/hooks/api/useInbox';
import { getInitials, displayName } from './utils';
import { useI18n } from '@/lib/i18n';

export function NewConversationDialog({
  open,
  onOpenChange,
  colleagues,
  currentUserId,
  onStart,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  colleagues: ConversationParticipant[];
  currentUserId: string | undefined;
  onStart: (receiverId: string, content: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<ConversationParticipant | null>(null);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setSelected(null); setMessage(''); setError(null); };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleStart = async () => {
    if (!selected || !message.trim() || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      await onStart(selected.user_id, message.trim());
      handleOpenChange(false);
    } catch {
      setError(t('pages.inbox.sendError'));
    } finally {
      setIsSending(false);
    }
  };

  const selectable = colleagues.filter((c) => c.user_id !== currentUserId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pages.inbox.newConversationTitle')}</DialogTitle>
          <DialogDescription>{t('pages.inbox.newConversationDescription')}</DialogDescription>
        </DialogHeader>

        {!selected ? (
          <Command className="rounded-lg border border-border">
            <CommandInput placeholder={t('pages.inbox.colleagueSearchPlaceholder')} />
            <CommandList>
              <CommandEmpty>{t('pages.inbox.noColleaguesFound')}</CommandEmpty>
              <CommandGroup>
                {selectable.map((c) => (
                  <CommandItem
                    key={c.user_id}
                    value={`${c.full_name ?? ''} ${c.email}`}
                    onSelect={() => setSelected(c)}
                    className="gap-2"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={c.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{getInitials(c.full_name, c.email)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{displayName(c.full_name, c.email, c.email)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 p-2 text-left transition-colors hover:bg-muted"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={selected.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-xs text-primary">{getInitials(selected.full_name, selected.email)}</AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate text-sm font-medium">{displayName(selected.full_name, selected.email, selected.email)}</span>
              <Check className="h-4 w-4 text-success" />
            </button>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('pages.inbox.firstMessagePlaceholder')}
              rows={4}
              autoFocus
              aria-label={t('pages.inbox.firstMessagePlaceholder')}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button onClick={handleStart} disabled={!message.trim() || isSending} className={cn('w-full gap-2')}>
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t('pages.inbox.startConversation')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
