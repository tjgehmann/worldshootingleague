import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

interface AuthValue {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: SignUpInput): Promise<void>;
  signOut(): Promise<void>;
}

export interface SignUpInput {
  email: string;
  password: string;
  handle: string;
  displayName: string;
  countryCode: string;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      loading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signUp({ email, password, handle, displayName, countryCode }) {
        // handle_new_user() reads this metadata to create the profile row.
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              handle: handle.trim().toLowerCase(),
              display_name: displayName.trim(),
              country_code: countryCode.trim().toUpperCase(),
            },
          },
        });
        if (error) throw error;
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
