import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send, Bot, User, Zap, Trash2, Play, Loader2,
  Sparkles, ArrowRight, Workflow as WorkflowIcon,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  useWorkflows,
  useToggleWorkflow,
  useDeleteWorkflow,
  sendWorkflowChat,
  type ChatMessage,
} from "@/hooks/api/useWorkflows";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { getErrorMessage } from '@/lib/errors';
import { tx } from '@/lib/inlineI18n';

const eventLabels = (): Record<string, string> => ({
  "lead.created": tx("Lead oprettet", "Lead created"),
  "lead.updated": tx("Lead opdateret", "Lead updated"),
  "deal.created": tx("Deal oprettet", "Deal created"),
  "deal.won": tx("Deal vundet", "Deal won"),
  "deal.lost": tx("Deal tabt", "Deal lost"),
  "task.created": tx("Opgave oprettet", "Task created"),
  "task.completed": tx("Opgave færdig", "Task completed"),
  "employee.created": tx("Medarbejder oprettet", "Employee created"),
  "employee.clocked_in": "Clock in",
  "employee.clocked_out": "Clock out",
  "invoice.created": tx("Faktura oprettet", "Invoice created"),
  "invoice.paid": tx("Faktura betalt", "Invoice paid"),
  "email.sent": tx("Email sendt", "Email sent"),
  "email.opened": tx("Email åbnet", "Email opened"),
});

function actionLabel(wf: { action_type: string; action_tool_slug?: string | null; webhook_url?: string | null }): string {
  if (wf.action_type === "run_integration") return wf.action_tool_slug ? `${tx("Kør", "Run")} ${wf.action_tool_slug}` : tx("Kør handling", "Run action");
  if (wf.action_type === "send_webhook") return "Webhook";
  return wf.action_type;
}

const quickPrompts = () => [
  { label: tx("Ny lead → Zapier", "New lead → Zapier"), prompt: tx("Når en ny lead bliver oprettet, send data til Zapier", "When a new lead is created, send the data to Zapier") },
  { label: tx("Deal vundet → Slack", "Deal won → Slack"), prompt: tx("Når en deal bliver vundet, send en besked til Zapier så den kan gå til Slack", "When a deal is won, send a message to Zapier so it can go to Slack") },
  { label: tx("Faktura betalt → Sheets", "Invoice paid → Sheets"), prompt: tx("Når en faktura bliver betalt, send betalingsdata til Zapier webhook", "When an invoice is paid, send the payment data to a Zapier webhook") },
  { label: tx("Foreslå workflows", "Suggest workflows"), prompt: tx("Foreslå smarte workflows baseret på min brug af systemet", "Suggest smart workflows based on how I use the system") },
];

export default function WorkflowsPage() {
  const { profile } = useAuth();
  const { data: workflows, refetch } = useWorkflows();
  const toggleMutation = useToggleWorkflow();
  const deleteMutation = useDeleteWorkflow();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showWorkflows, setShowWorkflows] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const reply = await sendWorkflowChat(newMessages);
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      // Refetch workflows if AI likely created/modified one
      refetch();
    } catch (e) {
      const errorMsg = getErrorMessage(e) || "Noget gik galt";
      toast.error(errorMsg);
      setMessages(prev => [...prev, { role: "assistant", content: `❌ ${errorMsg}` }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [messages, isLoading, refetch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const activeWorkflows = workflows?.filter(w => w.is_active) || [];
  const totalRuns = workflows?.reduce((s, w) => s + (w.run_count || 0), 0) || 0;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-1 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Automation Assistant</h1>
            <p className="text-xs text-muted-foreground">
              {tx("Skriv hvad du vil automatisere — AI bygger workflowet", "Describe what to automate — AI builds the workflow")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {activeWorkflows.length} aktive
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {totalRuns} {tx("kørsler", "runs")}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowWorkflows(!showWorkflows)}
          >
            <WorkflowIcon className="h-4 w-4 mr-1" />
            {showWorkflows ? "Skjul" : "Vis"} workflows
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {/* Welcome state */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Bot className="h-8 w-8 text-primary" />
                </div>
                <div className="text-center max-w-md">
                  <h2 className="text-xl font-semibold mb-2">
                    {tx("Hej! Jeg er din Automation Assistant 🤖", "Hi! I'm your Automation Assistant 🤖")}
                  </h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    {tx("Skriv hvad du gerne vil automatisere, og jeg opretter workflowet for dig. Du kan forbinde Zapier, Make eller enhver webhook.", "Describe what you want to automate and I'll create the workflow for you. You can connect Zapier, Make or any webhook.")}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
                  {quickPrompts().map((qp) => (
                    <button
                      key={qp.label}
                      onClick={() => send(qp.prompt)}
                      className="text-left p-3 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all text-sm group"
                    >
                      <span className="font-medium group-hover:text-primary transition-colors">
                        {qp.label}
                      </span>
                      <ArrowRight className="inline ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="space-y-4 pb-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted/50 border border-border/50 rounded-bl-md"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-8 w-8 rounded-full bg-foreground/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-muted/50 border border-border/50 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {tx("Tænker...", "Thinking...")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-4 border-t border-border/50">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={tx("Skriv fx \"Når en deal vindes, send det til Zapier\"...", "e.g. \"When a deal is won, send it to Zapier\"...")}
                disabled={isLoading}
                className="flex-1"
              />
              <Button type="submit" disabled={isLoading || !input.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>

        {/* Workflows sidebar */}
        {showWorkflows && (
          <div className="w-80 border-l border-border/50 flex flex-col">
            <div className="p-3 border-b border-border/50">
              <h3 className="font-semibold text-sm">Dine workflows</h3>
            </div>
            <ScrollArea className="flex-1 p-3">
              {!workflows?.length ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  {tx("Ingen workflows endnu", "No workflows yet")}
                </p>
              ) : (
                <div className="space-y-2">
                  {workflows.map((wf) => (
                    <Card key={wf.id} className={`${!wf.is_active ? "opacity-50" : ""}`}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">
                              {wf.description || wf.trigger_event}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {eventLabels()[wf.trigger_event] || wf.trigger_event} → {actionLabel(wf)}
                            </p>
                          </div>
                          <Switch
                            checked={wf.is_active}
                            onCheckedChange={(v) => {
                              toggleMutation.mutate({ id: wf.id, is_active: v });
                            }}
                            className="flex-shrink-0"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {wf.run_count || 0} {tx("kørsler", "runs")}
                            </Badge>
                            {wf.last_run_at && (
                              <span className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(wf.last_run_at), { addSuffix: true, locale: da })}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => send(`Test workflow ${wf.id}`)}
                            >
                              <Play className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                deleteMutation.mutate(wf.id);
                                toast.success("Workflow slettet");
                              }}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        {wf.last_error && (
                          <p className="text-[10px] text-destructive truncate">⚠️ {wf.last_error}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
