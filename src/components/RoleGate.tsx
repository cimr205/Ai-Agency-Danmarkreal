import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';

interface RoleGateProps {
  role?: string;
  allowedRoles?: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

export default function RoleGate({ role, allowedRoles, children, fallback }: RoleGateProps) {
  const { roles, isLoading } = useAuth();
  const { t } = useI18n();

  if (isLoading) return null;

  let allowed = false;

  if (allowedRoles && allowedRoles.length > 0) {
    allowed = roles.some(r => allowedRoles.includes(r.role));
  } else {
    const requiredRole = role ?? 'system_admin';
    const HIERARCHY: Record<string, number> = {
      system_admin: 1,
      company_admin: 2,
      owner: 2,
      manager: 3,
      employee: 4,
      partner: 5,
      readonly: 6,
    };
    const requiredLevel = HIERARCHY[requiredRole] ?? 6;
    const userBestLevel = Math.min(...roles.map(r => HIERARCHY[r.role] ?? 6), 6);
    allowed = userBestLevel <= requiredLevel;
  }

  if (!allowed) {
    return fallback ? <>{fallback}</> : <div className="text-sm text-muted-foreground">{t('common.adminOnly')}</div>;
  }

  return <>{children}</>;
}
