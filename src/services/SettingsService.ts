import { unwrap, type Db } from '../core/supabase';
import type { UserSettings, UserSettingsPatch } from '../core/types';

/** Leest en bewaart de persoonlijke instellingen van de ingelogde gebruiker. */
export class SettingsService {
  constructor(private readonly db: Db) {}

  static defaults(userId: string): UserSettings {
    return { user_id: userId, theme: 'system', notify_mentions: true, notify_messages: true, notify_sound: false, notify_browser: false, compact_mode: false };
  }

  /** Geeft de standaardwaarden terug zolang er nog niets is opgeslagen. */
  async load(userId: string): Promise<UserSettings> {
    const row = unwrap<UserSettings | null>(await this.db.from('user_settings').select('*').eq('user_id', userId).maybeSingle());
    return row ?? SettingsService.defaults(userId);
  }

  async save(userId: string, patch: UserSettingsPatch): Promise<UserSettings> {
    return unwrap(await this.db.from('user_settings').upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' }).select().single());
  }
}
