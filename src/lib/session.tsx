import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { clearLock } from './lock';
import { forgetThisPhone } from './notifications';
import { supabase } from './supabase';
import type { Couple, Profile } from './types';

type SessionState = {
  /** False until the saved sign-in has been checked. */
  ready: boolean;
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  couple: Couple | null;
  partner: Profile | null;
  /** Reload profile, couple and partner from the server. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [couple, setCouple] = useState<Couple | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null);

  const userId = session?.user.id ?? null;

  const load = useCallback(async (uid: string | null) => {
    if (!uid) {
      setProfile(null);
      setCouple(null);
      setPartner(null);
      return;
    }
    const { data: me } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile(me ?? null);
    if (!me?.couple_id) {
      setCouple(null);
      setPartner(null);
      return;
    }
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('couples').select('id, invite_code, invite_expires_at, together_since').eq('id', me.couple_id).maybeSingle(),
      supabase.from('profiles').select('*').eq('couple_id', me.couple_id).neq('id', uid).maybeSingle(),
    ]);
    setCouple(c ?? null);
    setPartner(p ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await load(data.session?.user.id ?? null);
      if (active) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Load outside the auth callback, as Supabase recommends.
      setTimeout(() => {
        load(next?.user.id ?? null);
      }, 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  const refresh = useCallback(() => load(userId), [load, userId]);
  const signOut = useCallback(async () => {
    if (userId) await forgetThisPhone(userId).catch(() => {});
    // The lock belongs to the account on this phone, so the next person to sign in starts without it.
    await clearLock().catch(() => {});
    await supabase.auth.signOut();
  }, [userId]);

  const value = useMemo(
    () => ({ ready, session, userId, profile, couple, partner, refresh, signOut }),
    [ready, session, userId, profile, couple, partner, refresh, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/**
 * For screens that only show once the couple is linked. Returns null for the
 * moment between unlinking or signing out and the app leaving the screen.
 */
export function useCouple() {
  const s = useSession();
  if (!s.userId || !s.profile || !s.couple || !s.partner) return null;
  return { ...s, userId: s.userId, profile: s.profile, couple: s.couple, partner: s.partner };
}
