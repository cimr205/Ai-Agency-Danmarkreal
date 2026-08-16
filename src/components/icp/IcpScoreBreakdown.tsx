import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, Target, ArrowRight } from "lucide-react";
import type { LeadIcpScore } from "@/hooks/api/useIcp";

function scoreTier(score: number) {
  if (score >= 80) return { label: "Hot Lead", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" };
  if (score >= 60) return { label: "Good Fit", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" };
  if (score >= 40) return { label: "Possible Fit", color: "bg-amber-500/15 text-amber-400 border-amber-500/20" };
  return { label: "Poor Fit", color: "bg-red-500/15 text-red-400 border-red-500/20" };
}

type Props = {
  score: LeadIcpScore;
  leadName?: string;
};

export default function IcpScoreBreakdown({ score, leadName }: Props) {
  const tier = scoreTier(score.total_score);

  const subScores = [
    { label: "Industry", value: score.industry_score, max: 25 },
    { label: "Location", value: score.location_score, max: 15 },
    { label: "Company Size", value: score.company_size_score, max: 15 },
    { label: "Role Fit", value: score.role_score, max: 10 },
    { label: "Pain Points", value: score.pain_point_score, max: 15 },
    { label: "Service Fit", value: score.service_fit_score, max: 10 },
    { label: "Budget Fit", value: score.budget_fit_score, max: 10 },
  ];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{leadName || "Lead"}</h3>
          <p className="text-xs text-muted-foreground">Confidence: {score.confidence_score}%</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold text-foreground">{score.total_score}</span>
          <Badge variant="outline" className={tier.color}>{tier.label}</Badge>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="space-y-2">
        {subScores.map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-24 shrink-0">{s.label}</span>
            <Progress value={(s.value / s.max) * 100} className="h-2 flex-1" />
            <span className="text-xs font-medium text-foreground w-10 text-right">{s.value}/{s.max}</span>
          </div>
        ))}
      </div>

      {/* Match Reasons */}
      {score.match_reasons.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-emerald-400 mb-1.5 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Match Reasons
          </h4>
          <ul className="space-y-1">
            {score.match_reasons.map((r, i) => (
              <li key={i} className="text-xs text-foreground/80 flex items-start gap-1.5">
                <span className="text-emerald-400 mt-0.5">•</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Red Flags */}
      {score.red_flags.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-amber-400 mb-1.5 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Red Flags
          </h4>
          <ul className="space-y-1">
            {score.red_flags.map((r, i) => (
              <li key={i} className="text-xs text-foreground/80 flex items-start gap-1.5">
                <span className="text-amber-400 mt-0.5">⚠</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended Action */}
      {score.recommended_action && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
          <ArrowRight className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs text-foreground">{score.recommended_action}</span>
        </div>
      )}
    </Card>
  );
}
