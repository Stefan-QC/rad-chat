import { unwrap, type Db } from '../core/supabase';
import { debounce, watchTables } from '../core/realtime';
import type { TeamScore, UserScore } from '../core/types';

export class LeaderboardService {
  constructor(private readonly db: Db) {}

  async users(limit = 50): Promise<UserScore[]> {
    return unwrap(await this.db.from('leaderboard_users').select('*').order('points', { ascending: false }).order('display_name').limit(limit));
  }

  async teams(): Promise<TeamScore[]> {
    return unwrap(await this.db.from('leaderboard_teams').select('*').order('points', { ascending: false }).order('name'));
  }

  /** Punten kunnen snel achter elkaar binnenkomen, dus meldingen worden gebundeld. */
  watch(onChange: () => void): () => void {
    return watchTables(this.db, ['point_events', 'team_members', 'profiles'], debounce(onChange, 400));
  }
}
