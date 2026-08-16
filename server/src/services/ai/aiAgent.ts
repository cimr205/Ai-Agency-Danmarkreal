import { askAI } from './openaiClient';
import { createAiActivity } from '../../repositories/aiActivityRepository';
import { createAiSuggestion } from '../../repositories/aiSuggestionRepository';
import { listLeadsByCompany } from '../../repositories/leadRepository';
import { listWorkflows } from '../../repositories/workflowRepository';

type CompanyAnalysisResult = {
  suggestions: Array<{
    type: 'workflow' | 'crm' | 'hr' | 'insight';
    title: string;
    description: string;
    json: Record<string, unknown>;
  }>;
};

export async function runCompanyAnalysis(companyId: string) {
  const leads = listLeadsByCompany(companyId);
  const workflows = listWorkflows(companyId);
  const prompt = JSON.stringify({ leads, workflows });
  const system = `You are an AI agent for a SaaS lead system. 
Return JSON: { "suggestions": [ { "type": "workflow|crm|hr|insight", "title": "...", "description": "...", "json": {} } ] }.
Be concise and only return valid JSON.`;

  const content = await askAI(prompt, system);
  const parsed = JSON.parse(content) as CompanyAnalysisResult;
  parsed.suggestions.forEach((suggestion) => {
    createAiSuggestion({
      companyId,
      type: suggestion.type,
      title: suggestion.title,
      description: suggestion.description,
      json: suggestion.json,
    });
  });
  createAiActivity({
    companyId,
    message: `AI analysis generated ${parsed.suggestions.length} suggestions.`,
    type: 'analysis',
  });
  return parsed.suggestions.length;
}

