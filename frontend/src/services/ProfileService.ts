import { expectOk, unwrap, type Db } from '../core/supabase';
import { watchTables } from '../core/realtime';
import type { Profile, ProfilePatch } from '../core/types';

export class ProfileService {
  constructor(private readonly db: Db) {}

  async listAll(): Promise<Profile[]> {
    return unwrap(await this.db.from('profiles').select('*').order('display_name'));
  }

  async getById(id: string): Promise<Profile | null> {
    return unwrap(await this.db.from('profiles').select('*').eq('id', id).maybeSingle());
  }

  async updateMine(userId: string, patch: ProfilePatch): Promise<Profile> {
    const clean: Record<string, unknown> = {
      display_name: patch.display_name.trim(),
      job_title: patch.job_title?.trim() || null,
      bio: patch.bio?.trim() || null,
      avatar_color: patch.avatar_color,
      ...(patch.birth_month !== undefined ? { birth_month: patch.birth_month, birth_day: patch.birth_day ?? null } : {}),
      ...(patch.start_date !== undefined ? { start_date: patch.start_date || null } : {}),
      ...(patch.coffee_opt_in !== undefined ? { coffee_opt_in: patch.coffee_opt_in } : {}),
    };
    return unwrap(await this.db.from('profiles').update(clean).eq('id', userId).select().single());
  }

  async setCoffeeOptIn(userId: string, value: boolean): Promise<void> {
    expectOk(await this.db.from('profiles').update({ coffee_opt_in: value }).eq('id', userId));
  }

  watch(onChange: () => void): () => void {
    return watchTables(this.db, ['profiles'], onChange);
  }
}
