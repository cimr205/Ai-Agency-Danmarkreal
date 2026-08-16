export interface Lead {
  id: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  status: 'new' | 'contacted' | 'qualified' | 'disqualified';
  source: 'email' | 'call' | 'import' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export interface LeadRepository {
  findById(id: string): Promise<Lead | null>;
  findByEmail(email: string): Promise<Lead | null>;
  create(input: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Promise<Lead>;
  update(id: string, updates: Partial<Lead>): Promise<Lead>;
}

