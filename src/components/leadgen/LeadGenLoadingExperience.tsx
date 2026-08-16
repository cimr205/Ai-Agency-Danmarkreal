import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Ban, Loader2, Sparkles, Globe, Mail, Phone, Building2, TrendingUp, Zap, Target, Users, BarChart3, Search, Database, Shield } from "lucide-react";

// ─── Data ───────────────────────────────────────────────────

const QUOTES = [
  { text: "The best sales reps don't sell — they help people buy.", author: "Sandler Training" },
  { text: "Every lead is someone's opportunity.", author: "Zig Ziglar" },
  { text: "Success is not the key to motivation. Motivation is the key to success.", author: "Albert Schweitzer" },
  { text: "Quality over quantity. One conversation can change everything.", author: "Unknown" },
  { text: "Your pipeline is your lifeline.", author: "Sales Proverb" },
  { text: "Don't find customers for your products — find products for your customers.", author: "Seth Godin" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Fortune favors the bold.", author: "Latin Proverb" },
  { text: "Leads are like seeds. You have to nurture them to grow.", author: "Modern Sales" },
  { text: "The harder you work, the luckier you get.", author: "Gary Player" },
];

const TIPS = [
  { icon: Mail, text: "Personlige emails har 6x højere transaktionsrate" },
  { icon: Phone, text: "Opfølgning indenfor 5 minutter øger konvertering 9x" },
  { icon: Target, text: "80% af salg kræver mindst 5 opfølgninger" },
  { icon: TrendingUp, text: "Virksomheder der nurture leads genererer 50% mere salg" },
  { icon: Users, text: "Referrals har 30% højere konverteringsrate" },
  { icon: BarChart3, text: "Data-drevet salg øger hitrate med 15-20%" },
  { icon: Shield, text: "GDPR-compliance styrker tilliden til dit brand" },
  { icon: Zap, text: "Automatisering sparer gennemsnitligt 2t dagligt per sælger" },
];

const PHASES = [
  { min: 0, max: 15, label: "Søger i forretningsregistre...", icon: Database },
  { min: 15, max: 35, label: "Scanner Google Maps...", icon: Globe },
  { min: 35, max: 60, label: "Beriger med kontaktdata...", icon: Mail },
  { min: 60, max: 85, label: "Scorer og validerer leads...", icon: TrendingUp },
  { min: 85, max: 100, label: "Færdiggør resultater...", icon: Sparkles },
];

// ─── Animated Counter ───────────────────────────────────────

function AnimatedNumber({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    const diff = value - displayed;
    if (diff === 0) return;
    const step = Math.max(1, Math.abs(diff) > 10 ? Math.floor(Math.abs(diff) / 5) : 1);
    const timer = setTimeout(() => {
      setDisplayed((prev) => {
        if (prev < value) return Math.min(prev + step, value);
        return Math.max(prev - step, value);
      });
    }, 40);
    return () => clearTimeout(timer);
  }, [value, displayed]);
  return <span>{displayed}</span>;
}

// ─── Main Component ─────────────────────────────────────────

interface Props {
  progress: number;
  progressLabel: string | null;
  resultsCount: number;
  query: string;
  onCancel: () => void;
}

export default function LeadGenLoadingExperience({ progress, progressLabel, resultsCount, query, onCancel }: Props) {
  const [quoteIdx, setQuoteIdx] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [tipIdx, setTipIdx] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [elapsed, setElapsed] = useState(0);

  // Rotate quotes every 6s
  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIdx((prev) => (prev + 1) % QUOTES.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // Rotate tips every 8s
  useEffect(() => {
    const interval = setInterval(() => {
      setTipIdx((prev) => (prev + 1) % TIPS.length);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const currentPhase = useMemo(
    () => PHASES.find((p) => progress >= p.min && progress < p.max) || PHASES[PHASES.length - 1],
    [progress]
  );

  const quote = QUOTES[quoteIdx];
  const tip = TIPS[tipIdx];
  const TipIcon = tip.icon;
  const PhaseIcon = currentPhase.icon;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <Card className="p-0 overflow-hidden animate-fade-in border-primary/20">
      {/* Top gradient bar */}
      <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-primary/30 relative overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-primary transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <PhaseIcon className="h-6 w-6 text-primary animate-pulse" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary animate-ping opacity-40" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground text-lg">Finder dine leads...</h2>
              <p className="text-sm text-muted-foreground">"{query}"</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={onCancel} className="gap-1.5 text-muted-foreground hover:text-destructive">
            <Ban className="h-3.5 w-3.5" />
            Stop
          </Button>
        </div>

        {/* Progress section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              {progressLabel || currentPhase.label}
            </span>
            <span className="font-mono text-primary font-semibold">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2.5" />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-xl bg-muted/40">
            <div className="text-2xl font-bold text-foreground">
              <AnimatedNumber value={resultsCount} />
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Leads fundet</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-muted/40">
            <div className="text-2xl font-bold text-foreground">{formatTime(elapsed)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Forløbet tid</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-muted/40">
            <div className="text-2xl font-bold text-primary">
              {PHASES.findIndex((p) => p === currentPhase) + 1}/{PHASES.length}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Fase</div>
          </div>
        </div>

        {/* Pipeline visualization */}
        <div className="flex items-center gap-1">
          {PHASES.map((phase, i) => {
            const isActive = phase === currentPhase;
            const isDone = progress >= phase.max;
            const Icon = phase.icon;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className={`w-full h-1.5 rounded-full transition-colors duration-500 ${
                  isDone ? "bg-primary" : isActive ? "bg-primary/50 animate-pulse" : "bg-muted"
                }`} />
                <Icon className={`h-3.5 w-3.5 transition-colors duration-500 ${
                  isDone ? "text-primary" : isActive ? "text-primary/70" : "text-muted-foreground/40"
                }`} />
              </div>
            );
          })}
        </div>

        {/* Quote card */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/10 p-5">
          <div className="absolute top-2 left-3 text-4xl text-primary/15 font-serif leading-none">"</div>
          <div className="relative z-10">
            <p className="text-sm text-foreground/90 italic leading-relaxed transition-all duration-500">
              {quote.text}
            </p>
            <p className="text-xs text-muted-foreground mt-2">— {quote.author}</p>
          </div>
        </div>

        {/* Tip card */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border/50 transition-all duration-500">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <TipIcon className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Vidste du?</p>
            <p className="text-sm text-foreground/80 mt-0.5">{tip.text}</p>
          </div>
        </div>

        {/* Animated dots */}
        <div className="flex justify-center gap-1.5 pt-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
