import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bot, CheckCircle2, ExternalLink, Loader2, Sparkles } from "lucide-react";
import {
  useAIConnectionStatus, useConnectAIProvider, useDisconnectAIProvider, type AIProvider,
} from "@/hooks/api/useAIConnection";
import { cn } from "@/lib/utils";

const PROVIDERS: Array<{
  id: AIProvider; name: string; tagline: string; keyPlaceholder: string;
  keyUrl: string; free: boolean;
}> = [
  {
    id: "openai", name: "ChatGPT", tagline: "Bedst til kompleks ræsonnering (Autopilot m.fl.). Kræver betalingskort.",
    keyPlaceholder: "sk-…", keyUrl: "https://platform.openai.com/api-keys", free: false,
  },
  {
    id: "groq", name: "Groq", tagline: "Hurtige Llama-modeller. Reelt gratis — intet betalingskort nødvendigt.",
    keyPlaceholder: "gsk_…", keyUrl: "https://console.groq.com/keys", free: true,
  },
];

// Every AI feature in the app (workflows, AI-email, deal coach, m.fl.)
// resolves this samme forbindelse — ikke en delt platform-nøgle. Én
// udbyder ad gangen, valgt her, bruges overalt.
export default function AIConnectionPage() {
  const { data: connection, isLoading } = useAIConnectionStatus();
  const connect = useConnectAIProvider();
  const disconnect = useDisconnectAIProvider();
  const [apiKey, setApiKey] = useState("");
  const [selected, setSelected] = useState<AIProvider>("groq");

  const isConnected = connection?.status === "connected";
  const activeProviderMeta = PROVIDERS.find((p) => p.id === connection?.provider);
  const selectedMeta = PROVIDERS.find((p) => p.id === selected)!;

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Bot className="h-5 w-5" /> AI-udbyder
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Forbind en AI-konto — alle AI-funktioner i systemet (workflows, AI-email, deal coach, m.fl.) kører derefter gennem den.
        </p>
      </div>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : isConnected ? (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{activeProviderMeta?.name ?? "AI"} forbundet</CardTitle>
              <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-500">
                <CheckCircle2 className="h-3 w-3" /> Aktiv
              </Badge>
              {activeProviderMeta?.free && (
                <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                  <Sparkles className="h-3 w-3" /> Gratis
                </Badge>
              )}
            </div>
            <CardDescription>
              {connection?.last_tested_at && `Bekræftet ${new Date(connection.last_tested_at).toLocaleDateString("da-DK")}`}
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
            <CardTitle className="text-base">Forbind en AI-udbyder</CardTitle>
            <CardDescription>Vælg hvilken I vil bruge.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {connection?.status === "error" && connection.last_error && (
              <p className="text-sm text-destructive">{connection.last_error}</p>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p.id)}
                  className={cn(
                    "text-left rounded-lg border p-3 transition-colors",
                    selected === p.id ? "border-primary bg-primary/5" : "border-border/50 hover:border-border",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    {p.free && (
                      <Badge variant="outline" className="gap-1 border-primary/40 text-primary text-[10px] px-1.5 py-0">
                        <Sparkles className="h-2.5 w-2.5" /> Gratis
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{p.tagline}</p>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-key">{selectedMeta.name} API-nøgle</Label>
              <Input
                id="ai-key"
                type="password"
                placeholder={selectedMeta.keyPlaceholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                disabled={!apiKey.trim() || connect.isPending}
                onClick={() =>
                  connect.mutate(
                    { apiKey: apiKey.trim(), provider: selected },
                    { onSuccess: () => setApiKey("") },
                  )
                }
              >
                {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Forbind
              </Button>
              <a
                href={selectedMeta.keyUrl}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" /> Opret en nøgle hos {selectedMeta.name}
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
