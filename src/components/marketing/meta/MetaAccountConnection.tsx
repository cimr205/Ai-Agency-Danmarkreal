import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, CheckCircle2, RefreshCw, AlertCircle, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from '@/lib/errors';

type MetaConnection = {
  id: string;
  status: string;
  meta_user_name: string | null;
  meta_user_id: string | null;
  connected_at: string;
  token_expires_at: string | null;
  last_sync_at?: string | null;
  sync_status?: string;
  sync_error?: string | null;
};

type MetaAdAccount = {
  id: string;
  account_id: string;
  account_name: string | null;
  business_name: string | null;
  currency: string | null;
  account_status: number | null;
};

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  connected: { label: "Forbundet", color: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", icon: CheckCircle2 },
  disconnected: { label: "Ikke forbundet", color: "border-muted bg-muted text-muted-foreground", icon: XCircle },
  error: { label: "Fejl", color: "border-destructive/30 bg-destructive/10 text-destructive", icon: AlertCircle },
  pending: { label: "Afventer", color: "border-amber-500/30 bg-amber-500/10 text-amber-400", icon: Loader2 },
  // Live-verified bug (2026-09-05): a real, distinct backend status
  // ("token expired, needs re-auth" — different from "never connected")
  // fell through to the disconnected fallback below, so the header badge
  // said "Ikke forbundet" while this same card kept showing real cached
  // ad accounts — a contradictory "disconnected but here's your data" UI.
  reconnect_required: { label: "Kræver genforbindelse", color: "border-amber-500/30 bg-amber-500/10 text-amber-400", icon: AlertCircle },
};

export function MetaAccountConnection() {
  const { user } = useAuth();
  const companyId = user?.company_id;
  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchConnection = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_meta_connection_status");
      if (error) throw error;
      const status = data as unknown as MetaConnection & { ad_accounts?: MetaAdAccount[] };
      setConnection(status.status === "disconnected" ? null : status);
      setAdAccounts(status.ad_accounts ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchConnection();
  }, [fetchConnection]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-oauth-start", { body: {} });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.detail || data.error);
      if (!data?.authorization_url) throw new Error("Meta authorization URL mangler");
      window.location.assign(data.authorization_url);
    } catch (err) {
      toast({ title: "Forbindelse fejlede", description: getErrorMessage(err) || String(err), variant: "destructive" });
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-sync", { body: {} });
      if (error || data?.error) throw new Error(data?.detail || error?.message || data?.error);
      toast({ title: "Meta Ads opdateret", description: `${data.records_synced} poster synkroniseret.` });
      await fetchConnection();
    } catch (err) {
      toast({ title: "Synkronisering fejlede", description: getErrorMessage(err), variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleDisconnect = async () => {
    if (!companyId) return;
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-disconnect", {
        body: { company_id: companyId },
      });
      if (error) throw new Error(error.message);
      toast({ title: "Meta Ads afbrudt" });
      await fetchConnection();
    } catch (err) {
      toast({ title: "Afbrydelse fejlede", description: getErrorMessage(err) || String(err), variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = connection?.status === "connected";
  const needsReconnect = connection?.status === "reconnect_required";
  const cfg = statusConfig[connection?.status || "disconnected"] || statusConfig.disconnected;
  const StatusIcon = cfg.icon;

  if (loading) {
    return (
      <Card className="border border-border/60 shadow-none">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/60 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[14px] font-medium">Meta Ads Forbindelse</CardTitle>
          {needsReconnect ? (
            <Button size="sm" variant="outline" className="gap-2 border-amber-500/40 text-amber-600 hover:text-amber-700" onClick={handleConnect}>
              <RefreshCw className="h-4 w-4" />
              Genopret forbindelse
            </Button>
          ) : !isConnected ? (
            <Button size="sm" className="gap-2" onClick={handleConnect}>
              <Link2 className="h-4 w-4" />
              Forbind Meta Ads
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="gap-2 text-muted-foreground" onClick={handleSync}>
                <RefreshCw className="h-3.5 w-3.5" />
                Opdater
              </Button>
              <Button size="sm" variant="outline" className="gap-2 text-muted-foreground hover:text-destructive" onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                Afbryd
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!connection || connection.status === "disconnected" ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Link2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Ingen konto forbundet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Forbind din Meta Ads konto for at administrere kampagner
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Connection status */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                  <StatusIcon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {connection.meta_user_name || "Meta bruger"}
                  </p>
                  <p className="text-xs text-muted-foreground">ID: {connection.meta_user_id}</p>
                </div>
              </div>
              <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                <StatusIcon className="h-2.5 w-2.5 mr-1" />
                {cfg.label}
              </Badge>
            </div>

            {/* Ad accounts */}
            {adAccounts.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
                  Annonce-konti ({adAccounts.length})
                </p>
                <div className="space-y-2">
                  {adAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between p-2.5 rounded-md border border-border bg-muted/20"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {acc.account_name || acc.account_id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {acc.account_id}
                          {acc.business_name && ` · ${acc.business_name}`}
                          {acc.currency && ` · ${acc.currency}`}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          acc.account_status === 1
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {acc.account_status === 1 ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {adAccounts.length === 0 && isConnected && (
              <div className="text-center py-4">
                <AlertCircle className="h-5 w-5 text-amber-500 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">
                  Ingen annonce-konti fundet. Tjek at din Meta-bruger har adgang til annonce-konti.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
