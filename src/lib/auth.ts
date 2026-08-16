export type AppRole = 'system_admin' | 'company_admin' | 'manager' | 'employee' | 'readonly' | 'owner' | 'admin';

export const ROLE_LABELS: Record<string, string> = {
  system_admin: 'System Admin',
  company_admin: 'Virksomhedsadmin',
  manager: 'Manager',
  employee: 'Medarbejder',
  readonly: 'Kun læseadgang',
  owner: 'Owner',
  admin: 'Admin',
};

export const ROLE_HIERARCHY: Record<string, number> = {
  system_admin: 1,
  owner: 1,
  company_admin: 2,
  admin: 2,
  manager: 3,
  employee: 4,
  readonly: 5,
};

export function canManageRole(currentRole: string, targetRole: string): boolean {
  const currentLevel = ROLE_HIERARCHY[currentRole] ?? 5;
  const targetLevel = ROLE_HIERARCHY[targetRole] ?? 5;
  return currentLevel < targetLevel;
}
