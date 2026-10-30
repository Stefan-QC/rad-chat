import type { Session } from '@supabase/supabase-js';
import { AppError } from '../core/AppError';
import { expectOk, type Db } from '../core/supabase';

export class AuthService {
  constructor(private readonly db: Db) {}

  async getSession(): Promise<Session | null> {
    const { data } = await this.db.auth.getSession();
    return data.session;
  }

  async signIn(email: string, password: string): Promise<void> {
    expectOk(await this.db.auth.signInWithPassword({ email: email.trim(), password }));
    await this.db.rpc('log_login');
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }

  /** Wijzigt het wachtwoord van de ingelogde gebruiker na controle van het huidige; een ander account kan hiermee nooit worden aangepast. */
  async changePassword(email: string, currentPassword: string, newPassword: string): Promise<void> {
    const check = await this.db.auth.signInWithPassword({ email, password: currentPassword });
    if (check.error) throw new AppError('wrong_current_password', 'Your current password is not correct.');
    expectOk(await this.db.auth.updateUser({ password: newPassword }));
  }

  onChange(listener: (session: Session | null) => void): () => void {
    const { data } = this.db.auth.onAuthStateChange((_event, session) => listener(session));
    return () => data.subscription.unsubscribe();
  }
}
