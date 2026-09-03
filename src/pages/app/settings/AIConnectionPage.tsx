import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useAIStatus } from "@/hooks/api/useAIConnection";

// AI runs on one shared, self-hosted Ollama instance — the approved stack
// (Ollama/llama.cpp only, no hosted LLM APIs). There is nothing to connect
// per company anymore; this page just reports whether the model is
// reachable right now, since every AI feature in the app (workflows,
// AI-email, deal coach, Operating Manager, m.fl.) depends on it.
export default function AIConnectionPage() {
  const { data: status, isLoading } = useAIStatus();

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Bot className="h-5 w-5" /> AI-model
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alle AI-funktioner i systemet (workflows, AI-email, deal coach, Operating Manager, m.fl.) kører på én delt, selv-hostet model — ingen opsætning per virksomhed.
        </p>
      </div>

      <Card className={status?.online ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Ollama</CardTitle>
            {isLoading ? (
              <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Tjekker…</Badge>
            ) : status?.online ? (
              <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-500"><CheckCircle2 className="h-3 w-3" /> Online</Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive"><XCircle className="h-3 w-3" /> Ikke tilgængelig</Badge>
            )}
          </div>
          <CardDescription>
            {isLoading ? "Henter status…" : status?.online ? `Model: ${status.detail}` : status?.detail}
          </CardDescription>
        </CardHeader>
        {!isLoading && !status?.online && (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Den selv-hostede Ollama-instans svarer ikke. AI-funktioner virker ikke før den er oppe igen — dette kræver ingen handling fra jer, det er en drift-opgave.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
