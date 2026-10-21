import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, ClipboardList, Sparkles, X, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useProposeFollowup, useReviewAction, type ProposedAction } from '@/hooks/api/useLeadAssist';
import { getErrorMessage } from '@/lib/errors';

/**
 * Contextual AI-assisted action on a lead: "Prepare a follow-up". AI prepares a
 * structured, low-risk task proposal (what / why / what-changes / risk); the
 * employee stays in control and must approve before anything is created. The
 * action executes server-side exactly once with an audit trail.
 *
 * Strings are inline Danish to match the existing CRM panels (e.g. LogActivityForm)
 * and to avoid touching the shared i18n message files that another agent is editing.
 */
export function LeadFollowupAction({ leadId, leadName, suggestedTitle }: { leadId: string; leadName: string; suggestedTitle?: string }) {
  const propose = useProposeFollowup();
  const review = useReviewAction();
  const [proposal, setProposal] = useState<ProposedAction | null>(null);
  const [createdTitle, setCreatedTitle] = useState<string | null>(null);

  const dueDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const title = (suggestedTitle?.trim() || `Følg op på ${leadName}`).slice(0, 120);

  const prepare = async () => {
    setCreatedTitle(null);
    try {
      setProposal(await propose.mutateAsync({ leadId, title, dueDate, priority: 'high' }));
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Kunne ikke forberede handlingen');
    }
  };

  const decide = async (operation: 'approve' | 'reject') => {
    if (!proposal) return;
    try {
      await review.mutateAsync({ actionId: proposal.id, operation });
      if (operation === 'approve') {
        setCreatedTitle((proposal.payload?.title as string) ?? title);
        toast.success('Opgave oprettet');
      } else {
        toast.success('Forslag afvist');
      }
      setProposal(null);
    } catch (e) {
      toast.error(getErrorMessage(e) || 'Handlingen fejlede');
    }
  };

  // Result state — the approved task was created.
  if (createdTitle) {
    return (
      <Card className="border-success/30 bg-success/5" data-testid="followup-result">
        <CardContent className="flex items-start gap-3 py-4">
          <CheckCircle2 className="h-5 w-5 text-success mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Opfølgningsopgave oprettet</p>
            <p className="text-xs text-muted-foreground truncate">{createdTitle}</p>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={prepare}>Forbered igen</Button>
        </CardContent>
      </Card>
    );
  }

  // Proposal review state — what / why / what-changes / risk + approve/reject.
  if (proposal) {
    const fields = (proposal.payload ?? {}) as Record<string, unknown>;
    return (
      <Card className="border-primary/30" data-testid="followup-proposal">
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">AI foreslår en handling</span>
            <Badge variant="outline" className="ml-auto bg-success/15 text-success border-success/30 capitalize" data-testid="followup-risk">
              {proposal.risk_level} risiko
            </Badge>
          </div>

          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">Hvad</p>
            <p className="text-sm text-foreground/90">{proposal.headline}</p>
          </div>
          {proposal.rationale && (
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">Hvorfor</p>
              <p className="text-sm text-foreground/80">{proposal.rationale}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">Hvad ændres</p>
            <ul className="text-sm text-foreground/80 space-y-0.5 mt-1">
              <li>Titel: <span className="font-medium">{String(fields.title ?? '')}</span></li>
              <li>Forfald: <span className="font-medium">{String(fields.due_date ?? '')}</span></li>
              <li>Prioritet: <span className="font-medium">{String(fields.priority ?? '')}</span></li>
            </ul>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Udføres server-side efter din godkendelse.
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" className="flex-1" disabled={review.isPending} onClick={() => decide('approve')} data-testid="followup-approve">
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Godkend
            </Button>
            <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => decide('reject')} data-testid="followup-reject">
              <X className="h-4 w-4 mr-1.5" /> Afvis
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Initial state — offer to prepare the follow-up.
  return (
    <Button variant="outline" className="w-full gap-2" disabled={propose.isPending} onClick={prepare} data-testid="followup-prepare">
      <ClipboardList className="h-4 w-4" />
      {propose.isPending ? 'Forbereder…' : 'Forbered opfølgning (AI)'}
    </Button>
  );
}
