import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, timeout } from '../lib/supabase';

type Profile = { id: string; full_name: string; created_at?: string };

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, fullName: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function fallbackName(user: User | null) {
  return user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Kullanıcı';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
      return;
    }

    const name = fallbackName(currentUser);
    const { data, error } = await timeout(
      supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle(),
      8000
    );

    if (error) {
      console.error('Profil yükleme hatası:', error);
      setProfile({ id: currentUser.id, full_name: name });
      return;
    }

    if (!data) {
      const { data: inserted, error: insertError } = await timeout(
        supabase.from('profiles').upsert({ id: currentUser.id, full_name: name }).select().maybeSingle(),
        8000
      );
      if (insertError) console.error('Profil oluşturma hatası:', insertError);
      setProfile(inserted || { id: currentUser.id, full_name: name });
      return;
    }

    setProfile(data);
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data } = await timeout(supabase.auth.getSession(), 8000);
        if (!mounted) return;
        const currentSession = data.session;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        await loadProfile(currentSession?.user ?? null);
      } catch (err) {
        console.error('Auth init hatası:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    const { data } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      await loadProfile(currentSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await timeout(supabase.auth.signInWithPassword({ email, password }), 10000);
    if (error) return error.message;
    setSession(data.session);
    setUser(data.user);
    await loadProfile(data.user);
    return null;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await timeout(
      supabase.auth.signUp({ email, password, options: { data: { full_name: fullName || email.split('@')[0] } } }),
      10000
    );
    if (error) return error.message;
    if (data.user) await loadProfile(data.user);
    return null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    setSession(null);
    setUser(null);
    setProfile(null);
    window.location.href = '/login';
  };

  const value = useMemo(() => ({ user, session, profile, loading, signIn, signUp, signOut }), [user, session, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider içinde kullanılmalı');
  return ctx;
}
