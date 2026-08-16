import { readStore, updateStore } from '../db';

export interface EmailAnalysisJobRecord {
  id: string;
  emailId: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export function createEmailAnalysisJob(input: { id: string; emailId: string }) {
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;
  const record: EmailAnalysisJobRecord = {
    id: input.id,
    emailId: input.emailId,
    status: 'pending',
    createdAt,
    updatedAt,
  };
  updateStore((store) => {
    store.emailAnalysisJobs.push(record);
  });
  return record;
}

export function listPendingEmailAnalysisJobs() {
  const store = readStore();
  return store.emailAnalysisJobs.filter((row) => row.status === 'pending');
}

export function updateEmailAnalysisJobStatus(
  id: string,
  status: EmailAnalysisJobRecord['status'],
  error?: string
) {
  const updatedAt = new Date().toISOString();
  updateStore((store) => {
    const job = store.emailAnalysisJobs.find((row) => row.id === id);
    if (!job) return;
    job.status = status;
    job.error = error;
    job.updatedAt = updatedAt;
  });
  return updatedAt;
}

