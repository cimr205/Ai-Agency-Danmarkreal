import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bot, Plus, Copy, Check, Loader2, Trash2, KeyRound, Terminal, Sparkles, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useIssueMcpToken, useMcpTokens, useRevokeMcpToken } from "@/hooks/api/useMcpTokens";

const MCP_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server`;

const CLIENTS = [
  {
    id: "claude-code",
    name: "Claude Code",
    blurb: "Anthropic's CLI for engineers — tilføj som remote MCP server.",
    snippet: (token: string) =>
      `claude mcp add --transport http business-os ${MCP_URL} \\\n  --header "Authorization: Bearer ${token}"`,
    lang: "bash",
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    blurb: "Indsæt i ~/Library/Application Support/Claude/claude_desktop_config.json (macOS) eller %APPDATA%\\Claude\\claude_desktop_config.json (Windows).",
    snippet: (token: string) =>
      JSON.stringify(
        {
          mcpServers: {
            "business-os": {
              transport: { type: "http", url: MCP_URL, headers: { Authorization: `Bearer ${token}` } },
            },
          },
        },
        null,
        2,
      ),
    lang: "json",
  },
  {
    id: "cursor",
    name: "Cursor",
    blurb: "Indsæt i ~/.cursor/mcp.json (eller projektets .cursor/mcp.json).",
    snippet: (token: string) =>
      JSON.stringify(
        {
          mcpServers: {
            "business-os": {
              url: MCP_URL,
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        },
        null,
        2,
      ),
    lang: "json",
  },
  {
    id: "raw",
    name: "Andre klienter",
    blurb: "Enhver MCP-kompatibel klient (Zed, Continue, Cline, Open WebUI…) kan bruge endpointet direkte.",
    snippet: (token: string) =>
      `Endpoint: ${MCP_URL}\nTransport: streamable-http\nHeader: Authorization: Bearer ${token}`,
    lang: "text",
  },
] as const;

export function AiClientsPanel() {
  const { data: tokens = [], isLoading } = useMcpTokens();
  const issue = useIssueMcpToken();
  const revoke = useRevokeMcpToken();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<{ token: string; prefix: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("claude-code");

  const active = useMemo(() => tokens.filter((t) => !t.revoked_at), [tokens]);
  const tokenForSnippets = issued?.token ?? "<DIN_MCP_TOKEN>";

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success("Kopieret");
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };

  return (
    <section className="space-y-6">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div className="space-y-2 max-w-2xl">
          <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-muted-foreground/50">
            AI Clients · Model Context Protocol
          </div>
          <h2 className="text-2xl font-semibold tracking-tight font-display">
            Claude Code & venner kobler direkte til hele virksomhedens infrastruktur.
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Workspacet eksponerer leads, deals, opgaver, integrationer og webhook-handlinger som MCP-tools.
            Generer en token, sæt den i din AI-klient — så har Claude Code, Claude Desktop, Cursor osv.
            adgang til præcis det du har her, scoped til din virksomhed.
          </p>
        </div>
        <Button onClick={() => { setIssued(null); setName(""); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1.5" /> Ny token
        </Button>
      </div>

      {/* Setup snippets */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-border/40 bg-card/30 overflow-hidden"
      >
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start rounded-none bg-transparent border-b border-border/40 px-2 h-11">
            {CLIENTS.map((c) => (
              <TabsTrigger key={c.id} value={c.id} className="data-[state=active]:bg-card/60 data-[state=active]:border data-[state=active]:border-border/40 text-xs">
                {c.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {CLIENTS.map((c) => (
            <TabsContent key={c.id} value={c.id} className="p-5 space-y-3 mt-0">
              <p className="text-xs text-muted-foreground">{c.blurb}</p>
              <div className="relative">
                <pre className="text-[12px] leading-relaxed font-mono bg-background/60 border border-border/40 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all">
                  {c.snippet(tokenForSnippets)}
                </pre>
                <Button
                  size="sm" variant="ghost"
                  className="absolute top-2 right-2 h-7 text-[11px]"
                  onClick={() => copy(c.id, c.snippet(tokenForSnippets))}
                >
                  {copied === c.id ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                  Kopiér
                </Button>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Terminal className="h-3 w-3" />
                Endpoint: <code className="text-foreground/80">{MCP_URL}</code>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </motion.div>

      {/* Token list */}
      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground/60">
          <KeyRound className="h-3 w-3" /> Tokens ({active.length} aktive)
        </div>
        {isLoading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Henter…
          </div>
        ) : tokens.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary/70" />
            Ingen tokens endnu — opret én for at koble Claude Code til.
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {tokens.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center gap-4 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {t.token_prefix}…{t.revoked_at ? " · tilbagekaldt" : ""}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t.last_used_at ? `brugt ${new Date(t.last_used_at).toLocaleString("da-DK")}` : "aldrig brugt"}
                </div>
                {!t.revoked_at && (
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 text-[11px] text-muted-foreground hover:text-destructive"
                    onClick={() => revoke.mutate(t.id)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Tilbagekald
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Issue dialog */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setOpen(false); setIssued(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{issued ? "Token oprettet" : "Ny MCP token"}</DialogTitle>
            <DialogDescription>
              {issued
                ? "Kopiér tokenet nu — det vises kun denne ene gang."
                : "Giv tokenet et navn (fx 'Claude Code – Macbook')."}
            </DialogDescription>
          </DialogHeader>

          {!issued ? (
            <div className="space-y-3 py-2">
              <Label htmlFor="t-name" className="text-xs">Navn</Label>
              <Input
                id="t-name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Claude Code – Macbook" autoFocus
              />
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-200/90 flex gap-2">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Gem tokenet et sikkert sted. Vi opbevarer kun en hash — du kan ikke se det igen.
              </div>
              <div className="relative">
                <pre className="text-[12px] font-mono bg-background/60 border border-border/40 rounded-lg p-3 break-all whitespace-pre-wrap">
                  {issued.token}
                </pre>
                <Button
                  size="sm" variant="ghost"
                  className="absolute top-1.5 right-1.5 h-6 text-[11px]"
                  onClick={() => copy("issued", issued.token)}
                >
                  {copied === "issued" ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                  Kopiér
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            {!issued ? (
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>Annullér</Button>
                <Button
                  onClick={() => issue.mutate(name || "AI Client", { onSuccess: setIssued })}
                  disabled={issue.isPending}
                >
                  {issue.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Bot className="h-4 w-4 mr-1.5" />}
                  Opret token
                </Button>
              </>
            ) : (
              <Button onClick={() => { setOpen(false); setIssued(null); }}>Luk</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
