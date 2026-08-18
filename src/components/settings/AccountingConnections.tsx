import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Link2, XCircle, CheckCircle2, RefreshCw, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/lib/errors';

type DineroConnection = Tables<'dinero_connections'>;
type EconomicConnection = Tables<'economic_connections'>;

async function startOAuth(fn: 'dinero-oauth-start' | 'economic-oauth-start') {
  const { data, error } = await supabase.functions.invoke(fn, {
    body: { return_url: window.location.href.split('?')[0] },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  window.location.href = data.authorize_url;
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
    if (dineroStatus === 'connected') toast.success('Dinero forbundet!');
    if (dineroStatus === 'error') toast.error(`Dinero-forbindelse fejlede: ${params.get('dinero_error') || 'ukendt fejl'}`);
    if (economicStatus === 'connected') toast.success('e-conomic forbundet!');
    if (economicStatus === 'error') toast.error(`e-conomic-forbindelse fejlede: ${params.get('economic_error') || 'ukendt fejl'}`);
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
      toast.error(getErrorMessage(e) || 'Kunne ikke starte forbindelse');
      setBusy(null);
    }
  };

  const handleDisconnect = async (provider: 'dinero' | 'economic') => {
    setBusy(provider);
    try {
      const { data, error } = await supabase.functions.invoke('accounting-disconnect', { body: { provider } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(provider === 'dinero' ? 'Dinero afbrudt' : 'e-conomic afbrudt');
      await fetchConnections();
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Afbrydelse fejlede');
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async (provider: 'dinero' | 'economic') => {
    setBusy(`${provider}-import`);
    try {
      const { data, error } = await supabase.functions.invoke(provider === 'dinero' ? 'dinero-sync' : 'economic-sync', {
        body: { action: 'pull_customers' },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(`${data.imported} kunder importeret`);
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Import fejlede');
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
        <CardTitle className="text-base">Regnskabsintegrationer</CardTitle>
        <p className="text-xs text-muted-foreground">
          Forbind Dinero eller e-conomic for at synkronisere kunder og fakturaer to-vejs.
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
                    {isConnected ? (row.name || 'Forbundet') : 'Ikke forbundet'}
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
                      Importér kunder
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy === row.key}
                      onClick={() => handleDisconnect(row.key)}
                    >
                      {busy === row.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Afbryd'}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" className="gap-1.5" disabled={busy === row.key} onClick={() => handleConnect(row.key)}>
                    {busy === row.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    Forbind {row.label}
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
