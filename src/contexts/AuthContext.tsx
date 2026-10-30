import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { reportError, setSentryUser } from '@/lib/sentry';

export interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  company_id: string | null;
  onboarding_completed: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  roles: { role: string; can_grant_permissions: boolean }[];
  isAdmin: boolean;
  isSystemAdmin: boolean;
  /**
   * The single effective role, resolved from the user's (possibly multiple)
   * roles by a fixed precedence. The owner account holds system_admin +
   * company_admin + employee at once (QA #19); use this — never roles[0] — wherever
   * one role must be shown or decided, so every call site agrees. Mirrors the
   * DB function get_user_primary_role().
   */
  primaryRole: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string) => Promise<{ needsEmailConfirmation: boolean }>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<{ role: string; can_grant_permissions: boolean }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);
  const initializedRef = useRef(false);
  // onAuthStateChange fires an INITIAL_SESSION event on subscribe *and* the
  // getSession() call below resolves separately for the same session — both
  // used to call loadUser (and its profiles + user_roles queries) for the
  // same user, tripling those requests on every fresh load.
  const lastLoadedUserIdRef = useRef<string | null>(null);

  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, user_id, email, full_name, avatar_url, company_id, onboarding_completed')
      .eq('user_id', userId)
      .single();
    if (error || !data) return null;
    return data as UserProfile;
  };

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role, can_grant_permissions')
      .eq('user_id', userId);
    return data ?? [];
  };

  const loadUser = async (userId: string, force = false) => {
    if (!force && lastLoadedUserIdRef.current === userId) return;
    lastLoadedUserIdRef.current = userId;
    try {
      const [profile, userRoles] = await Promise.all([
        fetchProfile(userId),
        fetchRoles(userId),
      ]);
      if (mountedRef.current) {
        setUser(profile);
        setRoles(userRoles);
      }
    } catch (e) {
      // Ensure we still clear loading on error
      reportError(e, { module: 'auth', action: 'load_user_profile' });
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const refreshProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const profile = await fetchProfile(session.user.id);
    if (mountedRef.current && profile) setUser(profile);
  };

  // Monitoring only: tag error reports with opaque user/company ids.
  useEffect(() => {
    setSentryUser(user);
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;

    // Safety timeout — never stay loading forever
    const safetyTimer = setTimeout(() => {
      if (mountedRef.current && isLoading) {
        setIsLoading(false);
      }
    }, 8000);

    // Handle pending company code logic
    const handlePendingCode = async () => {
      const pendingCode = localStorage.getItem('pending_company_code');
      if (pendingCode) {
        try {
          await supabase.rpc('join_company_by_code', { _code: pendingCode });
        } catch (e) { /* best effort — invalid/expired code, ignore */ }
        localStorage.removeItem('pending_company_code');
        localStorage.removeItem('pending_company_id');
      }

      const pendingInviteToken = localStorage.getItem('pending_invite_token');
      if (pendingInviteToken) {
        try {
          await supabase.rpc('accept_invitation', { invite_token: pendingInviteToken });
        } catch (e) { /* best effort — invalid/expired token, ignore */ }
        localStorage.removeItem('pending_invite_token');
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await handlePendingCode();
        }
        // Use setTimeout to avoid potential Supabase deadlock on initial load
        setTimeout(() => {
          if (mountedRef.current) {
            loadUser(session.user.id);
          }
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        lastLoadedUserIdRef.current = null;
        if (mountedRef.current) {
          setUser(null);
          setRoles([]);
          setIsLoading(false);
        }
      }
    });

    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (initializedRef.current) return;
      initializedRef.current = true;

      if (session?.user) {
        await handlePendingCode();
        await loadUser(session.user.id);
      } else {
        if (mountedRef.current) setIsLoading(false);
      }
    });

    return () => {
      mountedRef.current = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const isSystemAdmin = roles.some(r => r.role === 'system_admin');
  const isAdmin = isSystemAdmin || roles.some(r => r.role === 'company_admin');

  // QA #19: a user can hold several roles at once. Resolve the one effective role
  // by a fixed precedence so single-role checks/labels are consistent everywhere.
  const ROLE_PRECEDENCE = ['system_admin', 'owner', 'company_admin', 'manager', 'employee', 'readonly', 'partner'];
  const primaryRole = ROLE_PRECEDENCE.find(r => roles.some(ur => ur.role === r)) ?? null;

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const signup = async (email: string, password: string, fullName: string) => {
    const pathParts = window.location.pathname.split('/');
    const locale = pathParts[1] && ['en', 'da', 'de'].includes(pathParts[1]) ? pathParts[1] : 'en';
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/${locale}/auth/callback`,
      },
    });
    if (error) throw new Error(error.message);
    return { needsEmailConfirmation: !data.session };
  };

  const loginWithGoogle = async () => {
    const pathParts = window.location.pathname.split('/');
    const locale = pathParts[1] && ['en', 'da', 'de'].includes(pathParts[1]) ? pathParts[1] : 'en';
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/${locale}/auth/callback`,
      },
    });
    if (error) throw new Error(error.message);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRoles([]);
    // Without this, a different user signing in on the same tab within the
    // cache's staleTime window would see the previous user's company data
    // served straight from memory, with no network request and no RLS check.
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      roles,
      isAdmin,
      isSystemAdmin,
      primaryRole,
      login,
      signup,
      loginWithGoogle,
      logout,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
