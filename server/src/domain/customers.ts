export interface Customer {
  id: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  create(input: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Customer>;
  update(id: string, updates: Partial<Customer>): Promise<Customer>;
}

