export type ActivityType = 'email' | 'task' | 'note';
export type ActivityDirection = 'inbound' | 'outbound';

export interface Activity {
  id: string;
  ownerUserId: string;
  type: ActivityType;
  summary: string;
  direction?: ActivityDirection;
  subject?: string;
  messageId?: string;
  createdAt: string;
  related: {
    leadId?: string;
    customerId?: string;
    dealId?: string;
  };
}

export interface ActivityRepository {
  findById(id: string): Promise<Activity | null>;
  create(input: Activity): Promise<Activity>;
}


