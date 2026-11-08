import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorDetails } from "@/components/shared/ErrorDetails";
import type { ExplainedErrorDetails } from "@/lib/errors";
import { t3 } from '@/lib/inlineI18n';

/**
 * Standardized error state — fills a gap the audit found consistently:
 * every page either shows no error UI at all (Dashboard, Intelligence,
 * ConnectedApps), or a single bare line of muted text with no retry
 * (Customers, Calendar, ClientView). Only LeadsPage and ColdCallerPage had
 * a real error card before this.
 */
export function ErrorState({
  title,
  message,
  details,
  onRetry,
  retryLabel = t3("Prøv igen", "Try again", "Erneut versuchen"),
  bare,
}: {
  title: string;
  /** The "why. what to do" sentence from explainError() — shown under the title. */
  message?: string;
  details?: ExplainedErrorDetails;
  onRetry?: () => void;
  retryLabel?: string;
  bare?: boolean;
}) {
  const content = (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <AlertCircle className="h-8 w-8 text-destructive/60" />
      <p className="text-sm text-destructive">{title}</p>
      {message ? <p className="max-w-md text-xs text-muted-foreground">{message}</p> : null}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          {retryLabel}
        </Button>
      )}
      {details ? <ErrorDetails details={details} /> : null}
    </div>
  );

  if (bare) return content;
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="p-0">{content}</CardContent>
    </Card>
  );
}
