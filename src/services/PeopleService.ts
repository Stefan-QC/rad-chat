import { expectOk, unwrap, type Db } from '../core/supabase';
import { watchTables } from '../core/realtime';
import type { Celebration, OnCallShift, StatusPatch, WorkLocation, WorkPlan } from '../core/types';

/** Alles rond collega's op de werkvloer: status, weekplanning, bereikbaarheidsrooster en jubilea. */
export class PeopleService {
  constructor(private readonly db: Db) {}

  async updateStatus(userId: string, patch: StatusPatch): Promise<void> {
    expectOk(await this.db.from('profiles').update(patch).eq('id', userId));
  }

  async listWorkPlans(fromDay: string, toDay: string): Promise<WorkPlan[]> {
    return unwrap(await this.db.from('work_plans').select('user_id, day, location').gte('day', fromDay).lte('day', toDay));
  }

  async setWorkPlan(day: string, location: WorkLocation | null): Promise<void> {
    expectOk(await this.db.rpc('set_work_plan', { p_day: day, p_location: location }));
  }

  watchWorkPlans(onChange: () => void): () => void {
    return watchTables(this.db, ['work_plans'], onChange);
  }

  async upcomingCelebrations(days = 30): Promise<Celebration[]> {
    return unwrap(await this.db.rpc('upcoming_celebrations', { p_days: days }));
  }

  async listOnCall(teamId: string): Promise<OnCallShift[]> {
    return unwrap(await this.db.from('oncall_shifts').select('*').eq('team_id', teamId).gte('ends_at', new Date().toISOString()).order('starts_at'));
  }

  async addOnCall(teamId: string, userId: string, start: string, end: string, note?: string): Promise<void> {
    expectOk(await this.db.rpc('add_oncall_shift', { p_team: teamId, p_user: userId, p_start: start, p_end: end, p_note: note ?? null }));
  }

  async removeOnCall(shiftId: number): Promise<void> {
    expectOk(await this.db.rpc('remove_oncall_shift', { p_id: shiftId }));
  }
}
