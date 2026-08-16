import { randomUUID } from 'crypto';
import { analyzeInboundEmail } from '../services/ai/aiService';
import { listUnhandledEmails, markEmailHandled } from '../repositories/emailRepository';
import { createTodo } from '../repositories/todoRepository';
import { createEmailAnalysisJob, updateEmailAnalysisJobStatus } from '../repositories/emailAnalysisJobRepository';

export function startEmailAnalysisWorker(intervalMs = 20000) {
  const run = async () => {
    const emails = listUnhandledEmails();
    for (const email of emails) {
      const job = createEmailAnalysisJob({ id: randomUUID(), emailId: email.id });
      updateEmailAnalysisJobStatus(job.id, 'running');
      try {
        const analysis = await analyzeInboundEmail({
          from: email.from,
          subject: email.subject,
          body: email.body,
        });
        if (analysis.requiresAction) {
          createTodo({
            id: randomUUID(),
            ownerUserId: email.ownerUserId,
            companyId: undefined,
            title: analysis.title,
            description: analysis.description,
            priorityBucket: analysis.priorityBucket,
            visibilityScope: analysis.visibilityScope,
            actionType: analysis.actionType,
            recommendedAction: analysis.recommendedAction,
            actionAlternatives: analysis.actionAlternatives,
            rationale: analysis.rationale,
            source: 'email',
            status: 'open',
          });
        }
        markEmailHandled(email.id, {
          handledStatus: 'analyzed',
          handledReason: analysis.rationale,
        });
        updateEmailAnalysisJobStatus(job.id, 'done');
      } catch (error) {
        updateEmailAnalysisJobStatus(job.id, 'failed', (error as Error).message);
      }
    }
  };

  run().catch(() => undefined);
  const handle = setInterval(() => {
    run().catch(() => undefined);
  }, intervalMs);
  return () => clearInterval(handle);
}

