import { expectOk, unwrap, type Db } from '../core/supabase';
import { watchTables } from '../core/realtime';
import type { Team, TeamMember, TeamWithMembers } from '../core/types';

export interface TeamDraft {
  name: string;
  description: string;
  color: string;
}

export class TeamService {
  constructor(private readonly db: Db) {}

  async list(): Promise<TeamWithMembers[]> {
    const [teams, members] = await Promise.all([
      this.db.from('teams').select('*').order('name'),
      this.db.from('team_members').select('*').order('joined_at'),
    ]);
    const memberRows = unwrap<TeamMember[]>(members);
    return unwrap<Team[]>(teams).map(team => ({ ...team, members: memberRows.filter(m => m.team_id === team.id) }));
  }

  async create(draft: TeamDraft): Promise<string> {
    return unwrap(await this.db.rpc('create_team', { p_name: draft.name, p_description: draft.description || null, p_color: draft.color }));
  }

  async update(teamId: string, draft: TeamDraft): Promise<void> {
    expectOk(await this.db.rpc('update_team', { p_team: teamId, p_name: draft.name, p_description: draft.description || null, p_color: draft.color }));
  }

  async join(teamId: string): Promise<void> {
    expectOk(await this.db.rpc('join_team', { p_team: teamId }));
  }

  async leave(teamId: string): Promise<void> {
    expectOk(await this.db.rpc('leave_team', { p_team: teamId }));
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    expectOk(await this.db.rpc('remove_team_member', { p_team: teamId, p_user: userId }));
  }

  async remove(teamId: string): Promise<void> {
    expectOk(await this.db.rpc('delete_team', { p_team: teamId }));
  }

  watch(onChange: () => void): () => void {
    return watchTables(this.db, ['teams', 'team_members'], onChange);
  }
}
