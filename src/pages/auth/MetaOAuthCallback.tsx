import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { invokeFunction } from "@/lib/functions";
import { explainError } from '@/lib/errors';
import { toast } from "@/hooks/use-toast";

/**
 * Handles the Meta OAuth redirect at /auth/meta/callback
 * Extracts the code, calls the edge function, then redirects back to Meta Ads page.
 */
export default function MetaOAuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const exchangeCode = useCallback(async (code: string, state: string) => {
    try {
      const data = await invokeFunction<{ error?: string; detail?: string; ad_accounts_count?: number }>("meta-oauth-callback", {
        body: { code, state },
      });

      if (data?.error) throw new Error(data.detail || data.error);

      toast({
        title: "Meta Ads forbundet!",
        description: `${data.ad_accounts_count} annonce-konti fundet.`,
      });
      navigate("/en/app/marketing/meta-ads", { replace: true });
    } catch (err) {
      setError(explainError(err).message);
    }
  }, [navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const errorParam = params.get("error");
    const errorDesc = params.get("error_description");

    if (errorParam) {
      setError(errorDesc || errorParam);
      return;
    }

    if (!code || !state) {
      setError("Manglende autorisationskode eller sikker OAuth-state");
      return;
    }

    void exchangeCode(code, state);
  }, [exchangeCode]);

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-4">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">Meta forbindelse fejlede</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => navigate("/en/app/marketing/meta-ads", { replace: true })}
            className="text-sm text-primary underline"
          >
            Gå tilbage til Meta Ads
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Forbinder Meta Ads konto...</p>
      </div>
    </div>
  );
}
