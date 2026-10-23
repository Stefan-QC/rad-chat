import { expectOk, unwrap, type Db } from '../core/supabase';
import { watchTables } from '../core/realtime';
import type { Profile, ProfilePatch, Role } from '../core/types';

export class ProfileService {
  constructor(private readonly db: Db) {}

  async listAll(): Promise<Profile[]> {
    return unwrap(await this.db.from('profiles').select('*').order('display_name'));
  }

  async getById(id: string): Promise<Profile | null> {
    return unwrap(await this.db.from('profiles').select('*').eq('id', id).maybeSingle());
  }

  async updateMine(userId: string, patch: ProfilePatch): Promise<Profile> {
    const clean: ProfilePatch = {
      display_name: patch.display_name.trim(),
      job_title: patch.job_title?.trim() || null,
      bio: patch.bio?.trim() || null,
      avatar_color: patch.avatar_color,
    };
    return unwrap(await this.db.from('profiles').update(clean).eq('id', userId).select().single());
  }

  async setRole(userId: string, role: Role): Promise<void> {
    expectOk(await this.db.rpc('set_user_role', { p_user: userId, p_role: role }));
  }

  watch(onChange: () => void): () => void {
    return watchTables(this.db, ['profiles'], onChange);
  }
}
