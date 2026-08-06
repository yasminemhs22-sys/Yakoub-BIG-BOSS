import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AdminProfileRow } from '@/lib/database.types';

export type AdminProfile = AdminProfileRow;

interface AuthValue {
  session: Session | null;
  profile: AdminProfile | null;
  permissions: readonly string[];
  /** True until the first session check completes. */
  loading: boolean;
  /** Signed in to Supabase Auth AND linked to an active admin_users row. */
  isAdmin: boolean;
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [permissions, setPermissions] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * A Supabase session is not the same thing as being an administrator.
   *
   * Someone can hold a valid auth token with no `admin_users` row, or with one
   * that has been deactivated. The dashboard must treat that as signed out, so
   * the profile lookup — not the session — is what decides.
   */
  const loadIdentity = useCallback(async (current: Session | null) => {
    if (!current) {
      setProfile(null);
      setPermissions([]);
      return;
    }

    const [profileRes, permsRes] = await Promise.all([
      supabase.rpc('my_profile'),
      supabase.rpc('my_permissions'),
    ]);

    if (profileRes.error || !profileRes.data) {
      // Authenticated, but not a member of staff. Do not leave a half-signed-in
      // state lying around.
      setProfile(null);
      setPermissions([]);
      return;
    }

    const p = profileRes.data as AdminProfile;
    if (!p.is_active) {
      setProfile(null);
      setPermissions([]);
      await supabase.auth.signOut();
      return;
    }

    setProfile(p);
    setPermissions((permsRes.data as string[] | null) ?? []);
    void supabase.rpc('touch_last_seen');
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadIdentity(data.session);
      if (!cancelled) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (cancelled) return;
      setSession(next);
      await loadIdentity(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadIdentity]);

  const value = useMemo<AuthValue>(() => {
    const permSet = new Set(permissions);
    return {
      session,
      profile,
      permissions,
      loading,
      isAdmin: Boolean(session && profile?.is_active),
      can: (permission) => permSet.has(permission),
      canAny: (...list) => list.some((p) => permSet.has(p)),
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        // The real reason is deliberately not surfaced: distinguishing "no such
        // account" from "wrong password" tells an attacker which emails exist.
        return { error: error ? 'invalid_credentials' : null };
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
        setPermissions([]);
      },
      refresh: async () => {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        await loadIdentity(data.session);
      },
    };
  }, [session, profile, permissions, loading, loadIdentity]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
