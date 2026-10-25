import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../core/types';
import { useServices } from './ServicesContext';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: AuthStatus;
  session: Session | null;
  me: Profile | null;
  reloadMe: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth, profiles, voice, lobby } = useServices();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);

  const loadProfile = useCallback(
    async (userId: string) => {
      setMe(await profiles.getById(userId));
    },
    [profiles],
  );

  useEffect(() => {
    let active = true;
    const apply = async (next: Session | null) => {
      if (!active) return;
      setSession(next);
      if (next) {
        await loadProfile(next.user.id);
        if (active) setStatus('signedIn');
      } else {
        setMe(null);
        setStatus('signedOut');
      }
    };
    void auth.getSession().then(apply);
    // Alleen echte aanmeld- en afmeldmomenten verwerken, niet elke tokenverversing.
    const stop = auth.onChange(next => {
      setTimeout(() => void apply(next), 0);
    });
    return () => {
      active = false;
      stop();
    };
  }, [auth, loadProfile]);

  const signOut = useCallback(async () => {
    await voice.dispose();
    lobby.leave();
    await auth.signOut();
  }, [auth, voice, lobby]);

  const reloadMe = useCallback(async () => {
    if (session) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const value = useMemo(() => ({ status, session, me, reloadMe, signOut }), [status, session, me, reloadMe, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** Het profiel van de ingelogde gebruiker; alleen te gebruiken binnen beveiligde pagina's. */
export function useMe(): Profile {
  const { me } = useAuth();
  if (!me) throw new Error('useMe requires a signed-in user');
  return me;
}
