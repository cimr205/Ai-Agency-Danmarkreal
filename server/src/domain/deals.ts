export type DealStageId =
  | 'new_lead'
  | 'contacted'
  | 'meeting_booked'
  | 'proposal_sent'
  | 'negotiation'
  | 'won'
  | 'lost';

export interface Deal {
  id: string;
  title: string;
  value: number;
  stageId: DealStageId;
  stageEnteredAt: string;
  createdAt: string;
  updatedAt: string;
  customerId?: string;
  leadId?: string;
  employeeId: string;
}

export interface DealRepository {
  findById(id: string): Promise<Deal | null>;
  findByStage(stageId: DealStageId): Promise<Deal[]>;
  create(input: Omit<Deal, 'id' | 'createdAt' | 'updatedAt'>): Promise<Deal>;
  update(id: string, updates: Partial<Deal>): Promise<Deal>;
}

