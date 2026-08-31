import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bot, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import {
  useAIConnectionStatus, useConnectAIProvider, useDisconnectAIProvider,
} from "@/hooks/api/useAIConnection";

// Every AI feature in the app (workflow-handlinger, AI-email, deal-coach,
// osv.) bruger denne forbindelse — ikke en delt platform-nøgle. Én konto,
// jeres egen regning hos OpenAI, forbindes her og bruges overalt.
export default function AIConnectionPage() {
  const { data: connection, isLoading } = useAIConnectionStatus();
  const connect = useConnectAIProvider();
  const disconnect = useDisconnectAIProvider();
  const [apiKey, setApiKey] = useState("");

  const isConnected = connection?.status === "connected";

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Bot className="h-5 w-5" /> AI-udbyder
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Forbind jeres eget ChatGPT/OpenAI-abonnement — alle AI-funktioner i systemet (workflows, AI-email, deal coach, m.fl.) kører derefter gennem jeres egen konto.
        </p>
      </div>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : isConnected ? (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">ChatGPT forbundet</CardTitle>
              <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-500">
                <CheckCircle2 className="h-3 w-3" /> Aktiv
              </Badge>
            </div>
            <CardDescription>
              Model: gpt-4o-mini
              {connection?.last_tested_at && ` · Bekræftet ${new Date(connection.last_tested_at).toLocaleDateString("da-DK")}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Afbryd forbindelse
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Forbind ChatGPT</CardTitle>
            <CardDescription>
              Kræver en API-nøgle fra platform.openai.com (en anden konto end almindeligt ChatGPT-abonnement — kræver betalingskort tilknyttet).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {connection?.status === "error" && connection.last_error && (
              <p className="text-sm text-destructive">{connection.last_error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="openai-key">OpenAI API-nøgle</Label>
              <Input
                id="openai-key"
                type="password"
                placeholder="sk-…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                disabled={!apiKey.trim() || connect.isPending}
                onClick={() =>
                  connect.mutate(apiKey.trim(), { onSuccess: () => setApiKey("") })
                }
              >
                {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Forbind
              </Button>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" /> Opret en nøgle hos OpenAI
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
