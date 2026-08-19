import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, CheckCircle2, RefreshCw, AlertCircle, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from '@/lib/errors';

const META_APP_ID = "1461822492213512";
const SCOPES = "ads_read,ads_management,business_management";

type MetaConnection = {
  id: string;
  status: string;
  meta_user_name: string | null;
  meta_user_id: string | null;
  connected_at: string;
  token_expires_at: string | null;
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
};

export function MetaAccountConnection() {
  const { user } = useAuth();
  const companyId = user?.company_id;
  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchConnection = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data: conn } = await supabase
        .from("meta_connections")
        .select("id, status, meta_user_name, meta_user_id, connected_at, token_expires_at")
        .eq("company_id", companyId)
        .maybeSingle();

      setConnection(conn as MetaConnection | null);

      if (conn && conn.status === "connected") {
        const { data: accounts } = await supabase
          .from("meta_ad_accounts")
          .select("id, account_id, account_name, business_name, currency, account_status")
          .eq("company_id", companyId);
        setAdAccounts((accounts as MetaAdAccount[]) || []);
      } else {
        setAdAccounts([]);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnection();
  }, [companyId]);

  // Handle OAuth callback code from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("meta_code");
    if (code && companyId) {
      handleOAuthCallback(code);
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete("meta_code");
      window.history.replaceState({}, "", url.toString());
    }
  }, [companyId]);

  const handleConnect = () => {
    const redirectUri = "https://aiagencydanmark.dk/auth/meta/callback";
    const authUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    authUrl.searchParams.set("client_id", META_APP_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", companyId || "");
    window.location.href = authUrl.toString();
  };

  const handleOAuthCallback = async (code: string) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-oauth-callback", {
        body: { code, company_id: companyId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.detail || data.error);

      toast({ title: "Meta Ads forbundet!", description: `${data.ad_accounts_count} annonce-konti fundet.` });
      await fetchConnection();
    } catch (err) {
      toast({ title: "Forbindelse fejlede", description: getErrorMessage(err) || String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
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
          {!isConnected ? (
            <Button size="sm" className="gap-2" onClick={handleConnect}>
              <Link2 className="h-4 w-4" />
              Forbind Meta Ads
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="gap-2 text-muted-foreground" onClick={fetchConnection}>
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
