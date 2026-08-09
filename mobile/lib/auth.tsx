import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { TERMS_VERSION } from './legal';
import { resetRedirectUrl } from './links';
import { registerForPush, unregisterPush } from './notifications';
import { supabase } from './supabase';

interface AuthValue {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  /**
   * True between following a reset link and setting a new password. The session
   * that arrives with the link is a real one, so without this flag the gate
   * would take the shooter straight to their matches — past the screen they
   * came to use.
   */
  recovering: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: SignUpInput): Promise<void>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  setPassword(password: string): Promise<void>;
}

export interface SignUpInput {
  email: string;
  password: string;
  handle: string;
  displayName: string;
  countryCode: string;
  /** ISO date. The signup trigger refuses anyone under 18. */
  dateOfBirth: string;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      // Claim the device for whoever is signed in. Failing here must never
      // block sign-in — push is an enhancement, not a precondition.
      if (next?.user.id) {
        registerForPush(next.user.id).catch(() => {});
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      loading,
      recovering,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signUp({ email, password, handle, displayName, countryCode, dateOfBirth }) {
        // handle_new_user() reads this metadata to create the profile row.
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              handle: handle.trim().toLowerCase(),
              display_name: displayName.trim(),
              country_code: countryCode.trim().toUpperCase(),
              date_of_birth: dateOfBirth,
              terms_version: TERMS_VERSION,
            },
          },
        });
        if (error) throw error;
      },
      async sendPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: resetRedirectUrl(),
        });
        if (error) throw error;
      },
      async setPassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setRecovering(false);
      },
      async signOut() {
        const uid = session?.user.id;
        if (uid) await unregisterPush(uid).catch(() => {});
        await supabase.auth.signOut();
        setRecovering(false);
      },
    }),
    [session, loading, recovering],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
