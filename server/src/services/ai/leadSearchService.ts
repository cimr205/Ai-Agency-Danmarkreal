import type { SearchCriteria, LeadCandidate } from '../clowdbot/providers';

type QuerySuggestion = {
  queries: string[];
};

export async function generateSearchQueries(criteria: SearchCriteria): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const fallback = [
    ...(criteria.keywords || []),
    ...(criteria.industries || []),
    ...(criteria.locations || []),
  ].filter(Boolean);
  if (!apiKey || fallback.length === 0) return fallback;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'Generate 5 concise lead search queries based on the criteria. Return JSON: {"queries":["..."]}.',
          },
          { role: 'user', content: JSON.stringify(criteria) },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return fallback;
    const parsed = JSON.parse(content) as QuerySuggestion;
    return parsed.queries?.length ? parsed.queries : fallback;
  } catch {
    return fallback;
  }
}

export function scoreLeadCandidate(candidate: LeadCandidate, criteria: SearchCriteria) {
  let score = 1;
  const terms = [
    ...(criteria.keywords || []),
    ...(criteria.industries || []),
    ...(criteria.roles || []),
  ].map((item) => item.toLowerCase());
  const haystack = [
    candidate.name,
    candidate.company,
    candidate.title,
    candidate.website,
    candidate.location,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  terms.forEach((term) => {
    if (haystack.includes(term)) score += 1;
  });
  if (candidate.email) score += 1;
  if (candidate.phone) score += 1;
  return Math.min(10, score);
}

