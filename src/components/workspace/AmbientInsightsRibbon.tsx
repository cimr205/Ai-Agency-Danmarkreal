import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isLocale } from "@/lib/i18n";
import { useAmbientInsights } from "@/hooks/useAmbientInsights";
import { AlertTriangle, ArrowUpRight, Lightbulb, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON = { risk: AlertTriangle, opportunity: ArrowUpRight, suggestion: Lightbulb, info: Sparkles };
const TONE = {
  risk: "text-destructive",
  opportunity: "text-emerald-400",
  suggestion: "text-amber-300",
  info: "text-muted-foreground/70",
};

/**
 * Calm ambient ribbon. Sits beneath the ContextBar and rotates subtle insights.
 * No popups, no chatbot — just intelligence in the periphery.
 */
export function AmbientInsightsRibbon() {
  const { data: insights } = useAmbientInsights();
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "en";

  useEffect(() => {
    if (!insights || insights.length <= 1) return;
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % insights.length);
        setVisible(true);
      }, 320);
    }, 7000);
    return () => clearInterval(t);
  }, [insights]);

  if (!insights || insights.length === 0) return null;
  const insight = insights[idx];
  const Icon = ICON[insight.kind];

  const handleClick = () => {
    if (insight.href) navigate(`/${locale}/app/${insight.href}`);
  };

  // Hide entirely when nothing meaningful is happening — calm by default.
  if (insight.kind === "info") return null;

  return (
    <div className="px-4 sm:px-8 max-w-[1400px] mx-auto w-full h-7 flex items-center overflow-hidden">
      <button
        onClick={handleClick}
        disabled={!insight.href}
        className={cn(
          "group flex items-center gap-2.5 text-[12px] text-muted-foreground/70 transition-all duration-500",
          visible ? "opacity-100" : "opacity-0",
          insight.href && "hover:text-foreground/90 cursor-pointer",
          !insight.href && "cursor-default",
        )}
      >
        <Icon className={cn("h-3 w-3 opacity-80", TONE[insight.kind])} />
        <span className="truncate max-w-[70ch]">{insight.text}</span>
      </button>
    </div>
  );
}
