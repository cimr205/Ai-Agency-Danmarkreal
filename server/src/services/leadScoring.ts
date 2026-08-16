export interface LeadSignalInput {
  outcome?: string;
  sentiment?: string;
  keywords?: string[];
  engagementScore?: number;
}

export function scoreLead(input: LeadSignalInput) {
  let score = 1;

  if (input.outcome) {
    if (['booked', 'interested', 'qualified'].includes(input.outcome)) score += 5;
    if (['not_interested', 'do_not_call'].includes(input.outcome)) score = 1;
  }

  if (input.sentiment) {
    if (input.sentiment === 'positive') score += 2;
    if (input.sentiment === 'negative') score -= 1;
  }

  if (typeof input.engagementScore === 'number') {
    score += Math.round(input.engagementScore);
  }

  if (input.keywords?.length) {
    const hotKeywords = ['demo', 'pricing', 'proposal', 'meeting'];
    if (input.keywords.some((kw) => hotKeywords.includes(kw.toLowerCase()))) {
      score += 2;
    }
  }

  return Math.max(1, Math.min(10, score));
}


