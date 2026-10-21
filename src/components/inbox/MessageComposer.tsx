import { useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

export function MessageComposer({ onSend, disabled }: { onSend: (content: string) => Promise<void>; disabled?: boolean }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleSend = async () => {
    const content = value.trim();
    if (!content || isSending || disabled) return;
    setIsSending(true);
    setError(null);
    try {
      await onSend(content);
      setValue('');
      requestAnimationFrame(autoResize);
    } catch {
      setError(t('pages.inbox.sendError'));
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="border-t border-border p-3">
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { setValue(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={t('pages.inbox.composerPlaceholder')}
          rows={1}
          aria-label={t('pages.inbox.composerPlaceholder')}
          className="max-h-40 min-h-[40px] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />
        <Button type="button" onClick={handleSend} disabled={disabled || isSending || !value.trim()} size="icon" className="h-10 w-10 shrink-0" aria-label={t('pages.inbox.send')}>
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">{t('pages.inbox.sendHint')}</p>
    </div>
  );
}
