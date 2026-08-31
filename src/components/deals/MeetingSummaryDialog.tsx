import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Mic, FileText, CheckCircle, TrendingUp, Mail, Copy, Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage, getFunctionErrorMessage } from '@/lib/errors';

interface MeetingSummaryResult {
  summary: string;
  key_points: string[];
  action_items: { title: string; assignee: string; due_days: number }[];
  deal_update: { suggested_stage: string | null; suggested_notes: string };
  sentiment: 'positive' | 'neutral' | 'negative';
  next_steps: string;
  follow_up_email_draft: string;
  tasks_created: number;
}

interface MeetingSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId?: string;
  leadId?: string;
}

export function MeetingSummaryDialog({ open, onOpenChange, dealId, leadId }: MeetingSummaryDialogProps) {
  const [transcript, setTranscript] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MeetingSummaryResult | null>(null);

  const analyze = async () => {
    if (!transcript.trim()) { toast.error('Indsæt mødenoter eller transskription'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('meeting-summary', {
        body: { transcript, deal_id: dealId, lead_id: leadId, meeting_title: meetingTitle },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      setResult(data);
      if (data.tasks_created > 0) toast.success(`${data.tasks_created} opgaver auto-oprettet`);
    } catch (e) {
      toast.error((getErrorMessage(e) || 'Kunne ikke analysere møde'));
    } finally {
      setLoading(false);
    }
  };

  const sentimentColors = {
    positive: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    neutral: 'bg-muted text-muted-foreground',
    negative: 'bg-destructive/15 text-destructive border-destructive/30',
  };
  const sentimentLabels = { positive: 'Positiv', neutral: 'Neutral', negative: 'Negativ' };

  const copyEmail = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.follow_up_email_draft);
    toast.success('Opfølgningsmail kopieret');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            AI Mødeopsummering
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mødetitel</Label>
              <Input
                value={meetingTitle}
                onChange={e => setMeetingTitle(e.target.value)}
                placeholder="F.eks. Salgsmøde med Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <Label>Mødenoter / Transskription *</Label>
              <Textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="Indsæt dine mødenoter, transskription fra Zoom/Teams, eller fritekst noter fra mødet her..."
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Tip: Jo mere detaljeret dine noter er, jo bedre bliver AI-analysen. Inkludér gerne hvem der sagde hvad.
              </p>
            </div>
            <Button onClick={analyze} disabled={loading || !transcript.trim()} className="w-full gap-2">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? 'Analyserer møde...' : 'Analysér med AI'}
            </Button>
            {loading && (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {/* Summary + Sentiment */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" /> Referat
                  </h3>
                  <Badge variant="outline" className={sentimentColors[result.sentiment]}>
                    {sentimentLabels[result.sentiment]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{result.summary}</p>
              </CardContent>
            </Card>

            {/* Key Points */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Vigtigste pointer</h4>
              <div className="space-y-1.5">
                {result.key_points.map((point, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Auto-created tasks */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Opgaver oprettet ({result.tasks_created})
              </h4>
              <div className="space-y-1.5">
                {result.action_items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{item.title} <span className="text-muted-foreground">— {item.assignee}, {item.due_days} dage</span></span>
                  </div>
                ))}
              </div>
            </div>

            {/* Next steps */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Næste skridt</h4>
                <p className="text-sm">{result.next_steps}</p>
              </CardContent>
            </Card>

            {/* Follow-up email */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opfølgningsmail</h4>
                <Button variant="ghost" size="sm" onClick={copyEmail} className="h-7 gap-1.5">
                  <Copy className="h-3.5 w-3.5" /> Kopiér
                </Button>
              </div>
              <div className="border rounded-lg p-3 bg-muted/30 text-sm whitespace-pre-wrap">
                {result.follow_up_email_draft}
              </div>
            </div>

            <Button variant="outline" onClick={() => { setResult(null); setTranscript(''); }} className="w-full">
              Analysér nyt møde
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
