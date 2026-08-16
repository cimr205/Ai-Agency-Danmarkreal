import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, User, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";

export function MetaQuickAnalyst() {
  const { locale } = useI18n();
  const isDa = locale === 'da';
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const quickPrompts = isDa
    ? [
        "Hvilken annonce spilder mest budget?",
        "Hvad bør jeg forbedre først?",
        "Hvilken kampagne bør jeg pause?",
        "Hvad skal jeg teste næste uge?",
      ]
    : [
        "Which ad is wasting the most budget?",
        "What should I improve first?",
        "Which campaign should I pause?",
        "What should I test next week?",
      ];

  const ask = async (question: string) => {
    if (loading) return;
    const trimmed = question.trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("meta-ads-ai", {
        body: { type: "analyst", question: trimmed },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setMessages((prev) => [...prev, { role: "assistant", text: data.answer }]);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : (isDa ? "Kunne ikke få svar" : "Failed to get answer"));
      setMessages((prev) => [...prev, { role: "assistant", text: `${isDa ? 'Fejl' : 'Error'}: ${msg}` }]);
      toast({ title: isDa ? "AI-analytikerfejl" : "AI Analyst Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">{isDa ? 'Hurtig AI-analytiker' : 'Quick AI Analyst'}</CardTitle>
          <Badge variant="secondary" className="text-[10px]">AI</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        {messages.length === 0 && !loading && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {isDa ? 'Spørg om hvad som helst vedrørende dine Meta Ads:' : 'Ask anything about your Meta Ads performance:'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quickPrompts.map((p) => (
                <Button key={p} variant="outline" size="sm" className="text-xs h-7" onClick={() => ask(p)}>
                  {p}
                </Button>
              ))}
            </div>
          </div>
        )}
        {(messages.length > 0 || loading) && (
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {messages.map((m, i) => (
              <div key={i} className="flex gap-2">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-muted" : "bg-primary/10"}`}>
                  {m.role === "user" ? <User className="h-3 w-3 text-muted-foreground" /> : <Bot className="h-3 w-3 text-primary" />}
                </div>
                <p className={`text-xs leading-relaxed ${m.role === "user" ? "font-medium text-foreground" : "text-muted-foreground"}`}>{m.text}</p>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Loader2 className="h-3 w-3 text-primary animate-spin" />
                </div>
                <p className="text-xs text-muted-foreground">{isDa ? 'Analyserer dine data...' : 'Analyzing your data...'}</p>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2 mt-auto pt-2">
          <Input
            placeholder={isDa ? 'Spørg om dine annoncer...' : 'Ask about your ads...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && input.trim() && ask(input.trim())}
            className="text-sm h-8"
            disabled={loading}
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={() => ask(input)} disabled={!input.trim() || loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
