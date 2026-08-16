/**
 * Email OAuth Callback Page
 * Handles the redirect from Gmail OAuth
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useEmailOAuthCallback } from '@/hooks/api';

export default function EmailCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const oauthCallback = useEmailOAuthCallback();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (code && state) {
      oauthCallback.mutateAsync({ code, state })
        .then(() => {
          setStatus('success');
        })
        .catch(() => {
          setStatus('error');
        });
    } else {
      setStatus('error');
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Gmail Forbindelse</CardTitle>
          <CardDescription>
            {status === 'loading' && 'Forbinder din Gmail konto...'}
            {status === 'success' && 'Din Gmail konto er forbundet!'}
            {status === 'error' && 'Der opstod en fejl'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === 'loading' && (
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <p className="text-center text-muted-foreground">
                Du kan nu synkronisere dine emails og se todos.
              </p>
              <Button onClick={() => navigate('/app/emails')}>
                Gå til Emails
              </Button>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="text-center text-muted-foreground">
                Kunne ikke forbinde din Gmail konto. Prøv igen.
              </p>
              <Button variant="outline" onClick={() => navigate('/app/emails')}>
                Tilbage til Emails
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
