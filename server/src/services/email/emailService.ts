import { randomUUID } from 'crypto';
import { ActivityRepository } from '../../domain/activities';

export interface SendEmailInput {
  ownerUserId: string;
  accountId: string;
  to: string[];
  subject: string;
  body: string;
  leadId?: string;
  customerId?: string;
  dealId?: string;
}

export interface EmailService {
  sendEmail(input: SendEmailInput): Promise<{ messageId: string }>;
  syncInbound(accountId: string): Promise<{ synced: number }>;
}

export class ManagedEmailService implements EmailService {
  constructor(private readonly activities: ActivityRepository) {}

  async sendEmail(input: SendEmailInput) {
    const messageId = randomUUID();
    await this.activities.create({
      id: randomUUID(),
      ownerUserId: input.ownerUserId,
      type: 'email',
      summary: `Outbound email: ${input.subject}`,
      direction: 'outbound',
      subject: input.subject,
      messageId,
      createdAt: new Date().toISOString(),
      related: {
        leadId: input.leadId,
        customerId: input.customerId,
        dealId: input.dealId,
      },
    });
    return { messageId };
  }

  async syncInbound(_accountId: string) {
    return { synced: 0 };
  }
}


