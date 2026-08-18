/**
 * Re-export useAuth — roles are now cached in AuthContext (single fetch).
 */
import { useAuth as useAuthContext, UserProfile } from '@/contexts/AuthContext';

export type AppRole = 'system_admin' | 'company_admin' | 'manager' | 'employee' | 'readonly' | 'partner' | 'owner' | 'admin';

interface ExtendedAuth {
  user: UserProfile | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSystemAdmin: boolean;
  roles: { role: string }[];
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string) => Promise<{ needsEmailConfirmation: boolean }>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export function useAuth(): ExtendedAuth {
  const ctx = useAuthContext();
  return {
    ...ctx,
    profile: ctx.user,
  };
}
