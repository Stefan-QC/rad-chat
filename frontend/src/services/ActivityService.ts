import { unwrap, type Db } from '../core/supabase';
import type { ActivityKind, ActivitySession } from '../core/types';

export class ActivityService {
  constructor(private readonly db: Db) {}

  async start(kind: ActivityKind, ref?: string): Promise<number> {
    return unwrap(await this.db.rpc('start_activity', { p_kind: kind, p_ref: ref ?? null }));
  }

  async end(sessionId: number): Promise<void> {
    await this.db.rpc('end_activity', { p_id: sessionId });
  }

  async listRecent(limit = 100): Promise<ActivitySession[]> {
    return unwrap(await this.db.from('activity_sessions').select('*').order('started_at', { ascending: false }).limit(limit));
  }
}
