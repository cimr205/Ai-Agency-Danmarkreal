import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { getLocaleFromPath, translate } from '@/lib/i18n';
import type { ExplainedErrorDetails } from '@/lib/errors';
import { cn } from '@/lib/utils';

/**
 * Collapsible "Show details" block for toasts and error cards — function
 * name, status, timestamp and request id, with a copy button for support.
 * Never shown expanded by default, and never includes tokens, stack traces
 * or other users' data (explainError() only ever puts those four fields in
 * `details`).
 *
 * Resolves translations from the URL locale directly (not useI18n()) because
 * toasts render through sonner's portal, which mounts outside the app's
 * I18nProvider tree — useI18n() there silently falls back to raw keys.
 */
export function ErrorDetails({ details, className }: { details: ExplainedErrorDetails; className?: string }) {
  const t = (key: string) => translate(getLocaleFromPath(), key);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasDetails = Boolean(details.functionName || details.status || details.requestId);
  if (!hasDetails) return null;

  const lines = [
    details.functionName ? `${t('errors.details.function')}: ${details.functionName}` : null,
    details.status ? `${t('errors.details.status')}: ${details.status}` : null,
    details.requestId ? `${t('errors.details.requestId')}: ${details.requestId}` : null,
    `${t('errors.details.time')}: ${details.timestamp}`,
  ].filter(Boolean) as string[];

  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail silently (permissions) — not worth surfacing another error for.
    }
  };

  return (
    <div className={cn('text-xs', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {open ? t('errors.details.hide') : t('errors.details.show')}
      </button>
      {open ? (
        <div className="mt-1.5 space-y-1 rounded-md border border-border/60 bg-muted/30 p-2">
          {lines.map((line) => (
            <p key={line} className="font-mono text-[11px] text-muted-foreground">{line}</p>
          ))}
          <button
            type="button"
            onClick={copyDetails}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? t('errors.details.copied') : t('errors.details.copy')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
