import { expectOk, unwrap, type Db } from '../core/supabase';
import { watchTables } from '../core/realtime';
import type { Channel, ChannelKind, ChannelMember, ChannelRole, PostPolicy } from '../core/types';

export interface PrivateChannelDraft {
  name: string;
  topic?: string;
  teamId?: string | null;
  memberIds: string[];
}

export class ChannelService {
  constructor(private readonly db: Db) {}

  async list(): Promise<Channel[]> {
    return unwrap(await this.db.from('channels').select('*').order('created_at'));
  }

  async listMembers(): Promise<ChannelMember[]> {
    return unwrap(await this.db.from('channel_members').select('*'));
  }

  async create(name: string, kind: ChannelKind, topic?: string): Promise<void> {
    expectOk(await this.db.rpc('create_channel', { p_name: name, p_kind: kind, p_topic: topic ?? null }));
  }

  /** Geeft het bestaande gesprek terug als die twee mensen al een DM hebben. */
  async startDirectMessage(userId: string): Promise<string> {
    return unwrap(await this.db.rpc('start_dm', { p_user: userId }));
  }

  async createGroup(name: string, memberIds: string[]): Promise<string> {
    return unwrap(await this.db.rpc('create_group', { p_name: name, p_members: memberIds }));
  }

  async createPrivateChannel(draft: PrivateChannelDraft): Promise<string> {
    return unwrap(await this.db.rpc('create_private_channel', {
      p_name: draft.name, p_topic: draft.topic ?? null, p_team: draft.teamId ?? null, p_members: draft.memberIds,
    }));
  }

  async addMember(channelId: string, userId: string, role: Exclude<ChannelRole, 'owner'> = 'member'): Promise<void> {
    expectOk(await this.db.rpc('add_channel_member', { p_channel: channelId, p_user: userId, p_role: role }));
  }

  async removeMember(channelId: string, userId: string): Promise<void> {
    expectOk(await this.db.rpc('remove_channel_member', { p_channel: channelId, p_user: userId }));
  }

  async leave(channelId: string): Promise<void> {
    expectOk(await this.db.rpc('leave_channel', { p_channel: channelId }));
  }

  async setMemberRole(channelId: string, userId: string, role: ChannelRole): Promise<void> {
    expectOk(await this.db.rpc('set_channel_member_role', { p_channel: channelId, p_user: userId, p_role: role }));
  }

  async setPostPolicy(channelId: string, policy: PostPolicy): Promise<void> {
    expectOk(await this.db.rpc('set_channel_post_policy', { p_channel: channelId, p_policy: policy }));
  }

  /** Herlaadt wanneer kanalen, kanaalleden of teamlidmaatschappen veranderen (die bepalen de zichtbaarheid). */
  watch(onChange: () => void): () => void {
    return watchTables(this.db, ['channels', 'channel_members', 'team_members'], onChange);
  }
}
