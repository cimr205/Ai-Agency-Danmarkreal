import { randomUUID } from 'crypto';
import {
  listCampaignsByOwner,
  listCampaignRecipients,
  updateCampaignRecipientStatus,
  updateCampaignStatus,
  updateCampaignJob,
  createCampaignJob,
} from '../repositories/campaignRepository';
import { ManagedEmailService } from '../services/email/emailService';
import { readStore } from '../db';

export function startCampaignWorker(emailService: ManagedEmailService, intervalMs = 15000) {
  const run = async () => {
    const store = readStore();
    const queued = store.campaigns.filter((campaign) => campaign.status === 'queued');
    for (const campaign of queued) {
      const job = createCampaignJob({ id: randomUUID(), campaignId: campaign.id });
      updateCampaignJob(job.id, { status: 'running', startedAt: new Date().toISOString() });
      updateCampaignStatus(campaign.id, 'sending');

      const recipients = listCampaignRecipients(campaign.id).filter((row) => row.status === 'pending');
      for (const recipient of recipients) {
        try {
          await emailService.sendEmail({
            ownerUserId: campaign.ownerUserId,
            accountId: 'campaign',
            to: [recipient.email],
            subject: campaign.name,
            body: `Hi ${recipient.name},\n\n${campaign.name}`,
          });
          updateCampaignRecipientStatus(recipient.id, 'sent');
        } catch (error) {
          updateCampaignRecipientStatus(recipient.id, 'failed', (error as Error).message);
        }
      }

      updateCampaignJob(job.id, { status: 'done', finishedAt: new Date().toISOString() });
      updateCampaignStatus(campaign.id, 'sent');
    }
  };

  run().catch(() => undefined);
  const handle = setInterval(() => {
    run().catch(() => undefined);
  }, intervalMs);

  return () => clearInterval(handle);
}

