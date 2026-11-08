import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Link2, XCircle, CheckCircle2, RefreshCw, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { invokeFunction } from '@/lib/functions';
import { showError } from '@/lib/showError';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { t3, tx } from '@/lib/inlineI18n';

type DineroConnection = Tables<'dinero_connections'>;
type EconomicConnection = Tables<'economic_connections'>;

async function startOAuth(fn: 'dinero-oauth-start' | 'economic-oauth-start') {
  const data = await invokeFunction<{ authorize_url: string; error?: string }>(fn, {
    body: { return_url: window.location.href.split('?')[0] },
  });
  if (data?.error) throw new Error(data.error);
  window.location.href = data.authorize_url;
}


// The OAuth callbacks redirect back with a short error code; show it as a sentence.
function oauthErrorText(code: string | null): string {
  switch (code) {
    case 'missing_state':
    case 'expired_state':
    case 'invalid_or_expired_state':
      return t3('Login-sessionen udløb. Start forbindelsen igen.', 'The sign-in session expired. Start the connection again.', 'Die Anmeldesitzung ist abgelaufen. Bitte Verbindung neu starten.');
    case 'missing_code':
    case 'user_declined_or_missing_token':
    case 'access_denied':
      return t3('Adgang blev ikke givet.', 'Access was not granted.', 'Der Zugriff wurde nicht erteilt.');
    case 'token_exchange_failed':
    case 'grant_token_invalid':
      return t3('Udbyderen afviste login. Prøv igen.', 'The provider rejected the sign-in. Please try again.', 'Der Anbieter hat die Anmeldung abgelehnt. Bitte erneut versuchen.');
    case 'no_organization':
      return t3('Kontoen har ingen virksomhed tilknyttet hos udbyderen.', 'The account has no company with the provider.', 'Das Konto hat beim Anbieter kein Unternehmen.');
    case 'save_failed':
    case 'internal_error':
      return t3('Forbindelsen kunne ikke gemmes. Prøv igen.', 'The connection could not be saved. Please try again.', 'Die Verbindung konnte nicht gespeichert werden. Bitte erneut versuchen.');
    default:
      return code || t3('ukendt fejl', 'unknown error', 'unbekannter Fehler');
  }
}

export function AccountingConnections() {
  const [dinero, setDinero] = useState<DineroConnection | null>(null);
  const [economic, setEconomic] = useState<EconomicConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchConnections = async () => {
    const [{ data: d }, { data: e }] = await Promise.all([
      supabase.from('dinero_connections')
        .select('id, company_id, dinero_organization_id, dinero_organization_name, status, last_synced_at, last_sync_error, connected_by, connected_at, disconnected_at, created_at, updated_at')
        .maybeSingle(),
      supabase.from('economic_connections')
        .select('id, company_id, agreement_number, company_name, status, last_synced_at, last_sync_error, connected_by, connected_at, disconnected_at, created_at, updated_at')
        .maybeSingle(),
    ]);
    setDinero(d as DineroConnection | null);
    setEconomic(e as EconomicConnection | null);
    setLoading(false);
  };

  useEffect(() => {
    fetchConnections();

    const params = new URLSearchParams(window.location.search);
    const dineroStatus = params.get('dinero');
    const economicStatus = params.get('economic');
    if (dineroStatus === 'connected') toast.success(t3('Dinero forbundet!', 'Dinero connected!', 'Dinero verbunden!'));
    if (dineroStatus === 'error') toast.error(`${t3("Dinero-forbindelse fejlede", "Dinero connection failed", "Dinero-Verbindung fehlgeschlagen")}: ${oauthErrorText(params.get('dinero_error'))}`);
    if (economicStatus === 'connected') toast.success(t3('e-conomic forbundet!', 'e-conomic connected!', 'e-conomic verbunden!'));
    if (economicStatus === 'error') toast.error(`${t3("e-conomic-forbindelse fejlede", "e-conomic connection failed", "e-conomic-Verbindung fehlgeschlagen")}: ${oauthErrorText(params.get('economic_error'))}`);
    if (dineroStatus || economicStatus) {
      const url = new URL(window.location.href);
      url.searchParams.delete('dinero');
      url.searchParams.delete('dinero_error');
      url.searchParams.delete('economic');
      url.searchParams.delete('economic_error');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const handleConnect = async (provider: 'dinero' | 'economic') => {
    setBusy(provider);
    try {
      await startOAuth(provider === 'dinero' ? 'dinero-oauth-start' : 'economic-oauth-start');
    } catch (e) {
      showError(e, { module: 'accounting' });
      setBusy(null);
    }
  };

  const handleDisconnect = async (provider: 'dinero' | 'economic') => {
    setBusy(provider);
    try {
      const data = await invokeFunction<{ error?: string }>('accounting-disconnect', { body: { provider } });
      if (data?.error) throw new Error(data.error);
      toast.success(t3(`${provider === 'dinero' ? 'Dinero' : 'e-conomic'} afbrudt`, `${provider === 'dinero' ? 'Dinero' : 'e-conomic'} disconnected`, `${provider === 'dinero' ? 'Dinero' : 'e-conomic'} getrennt`));
      await fetchConnections();
    } catch (e) {
      showError(e, { module: 'accounting' });
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async (provider: 'dinero' | 'economic') => {
    setBusy(`${provider}-import`);
    try {
      const data = await invokeFunction<{ imported: number; error?: string }>(provider === 'dinero' ? 'dinero-sync' : 'economic-sync', {
        body: { action: 'pull_customers' },
      });
      if (data?.error) throw new Error(data.error);
      toast.success(t3(`${data.imported} kunder importeret`, `${data.imported} customers imported`, `${data.imported} Kunden importiert`));
    } catch (e) {
      showError(e, { module: 'accounting' });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const rows: Array<{
    key: 'dinero' | 'economic';
    label: string;
    connection: DineroConnection | EconomicConnection | null;
    name: string | null;
  }> = [
    { key: 'dinero', label: 'Dinero', connection: dinero, name: dinero?.dinero_organization_name ?? null },
    { key: 'economic', label: 'e-conomic', connection: economic, name: economic?.company_name ?? null },
  ];

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{tx("Regnskabsintegrationer", "Accounting integrations")}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {tx("Forbind Dinero eller e-conomic for at synkronisere kunder og fakturaer to-vejs.", "Connect Dinero or e-conomic to sync customers and invoices both ways.")}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => {
          const isConnected = row.connection?.status === 'connected';
          return (
            <div key={row.key} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  {isConnected ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {isConnected ? (row.name || tx("Forbundet", "Connected")) : tx("Ikke forbundet", "Not connected")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={busy === `${row.key}-import`}
                      onClick={() => handleImport(row.key)}
                    >
                      {busy === `${row.key}-import` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      {tx("Importér kunder", "Import customers")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy === row.key}
                      onClick={() => handleDisconnect(row.key)}
                    >
                      {busy === row.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t3("Afbryd", "Disconnect", "Trennen")}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" className="gap-1.5" disabled={busy === row.key} onClick={() => handleConnect(row.key)}>
                    {busy === row.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    {tx("Forbind", "Connect")} {row.label}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
