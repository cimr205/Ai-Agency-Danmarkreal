import { AlertCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { explainError, type ExplainErrorContext } from '@/lib/errors';
import { ErrorDetails } from '@/components/shared/ErrorDetails';
import { reportError, type ReportContext } from '@/lib/sentry';

/**
 * The single place every call site shows an error to the user. Explains the
 * error via explainError() (area, reason, what to do — never raw SDK/JSON
 * text), renders it as one consistent toast with a collapsible "Show
 * details" section, and reports it to Sentry unless it's an expected 4xx —
 * reportError() already drops those via isExpectedError().
 */
export function showError(err: unknown, context: ExplainErrorContext & ReportContext = {}): void {
  const explained = explainError(err, context);

  reportError(err, {
    module: context.module,
    action: context.action,
    extra: {
      functionName: explained.details.functionName,
      status: explained.details.status,
      requestId: explained.details.requestId,
    },
  });

  toast.custom((id) => (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-destructive/30 bg-background p-4 text-foreground shadow-lg">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{explained.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{explained.message}</p>
        </div>
        <button
          type="button"
          onClick={() => toast.dismiss(id)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ErrorDetails details={explained.details} className="ml-[26px]" />
    </div>
  ));
}
