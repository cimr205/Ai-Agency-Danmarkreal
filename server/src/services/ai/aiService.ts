export interface EmailAnalysisInput {
  from: string;
  subject: string;
  body: string;
}

export interface EmailAnalysisResult {
  requiresAction: boolean;
  priorityBucket: 'now' | 'next' | 'later';
  actionType: string;
  recommendedAction: string;
  actionAlternatives: string[];
  visibilityScope: 'personal' | 'company';
  title: string;
  description: string;
  rationale: string;
  autoAccept: boolean;
  autoAction?: string;
}

const FALLBACK_ACTIONS = ['Respond', 'Offer', 'New deal', 'Deadline'];

function heuristicAnalysis(input: EmailAnalysisInput): EmailAnalysisResult {
  const subject = input.subject.toLowerCase();
  const body = input.body.toLowerCase();
  const combined = `${subject} ${body}`;
  const isUrgent = combined.includes('urgent') || combined.includes('asap');
  const isOffer = combined.includes('offer') || combined.includes('quote');
  const isDeadline = combined.includes('deadline') || combined.includes('due');
  const isInternal = combined.includes('internal') || combined.includes('team');

  let recommendedAction = 'Respond';
  if (isOffer) recommendedAction = 'Offer';
  if (isDeadline) recommendedAction = 'Deadline';

  const priorityBucket = isUrgent ? 'now' : isOffer ? 'next' : 'later';
  const requiresAction = true;
  const visibilityScope = isInternal ? 'company' : 'personal';

  return {
    requiresAction,
    priorityBucket,
    actionType: recommendedAction,
    recommendedAction,
    actionAlternatives: FALLBACK_ACTIONS.filter((action) => action !== recommendedAction),
    visibilityScope,
    title: input.subject || 'New email task',
    description: input.body.slice(0, 300),
    rationale: `Created because the email suggests a ${recommendedAction.toLowerCase()} action.`,
    autoAccept: !isUrgent && !isOffer && !isDeadline,
    autoAction: !isUrgent ? 'archive' : undefined,
  };
}

export async function analyzeInboundEmail(input: EmailAnalysisInput): Promise<EmailAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!apiKey) {
    return heuristicAnalysis(input);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You analyze inbound emails for CRM tasks. Return JSON with fields: requiresAction, priorityBucket, actionType, recommendedAction, actionAlternatives, visibilityScope, title, description, rationale, autoAccept, autoAction.',
          },
          {
            role: 'user',
            content: JSON.stringify(input),
          },
        ],
      }),
    });

    if (!response.ok) {
      return heuristicAnalysis(input);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return heuristicAnalysis(input);
    }
    const parsed = JSON.parse(content) as EmailAnalysisResult;
    return {
      ...parsed,
      actionAlternatives: parsed.actionAlternatives || FALLBACK_ACTIONS,
    };
  } catch {
    return heuristicAnalysis(input);
  }
}

