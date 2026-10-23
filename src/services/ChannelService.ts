import { expectOk, unwrap, type Db } from '../core/supabase';
import { watchTables } from '../core/realtime';
import type { Channel, ChannelKind } from '../core/types';

export class ChannelService {
  constructor(private readonly db: Db) {}

  async list(): Promise<Channel[]> {
    return unwrap(await this.db.from('channels').select('*').order('created_at'));
  }

  async create(name: string, kind: ChannelKind, topic?: string): Promise<void> {
    expectOk(await this.db.rpc('create_channel', { p_name: name, p_kind: kind, p_topic: topic ?? null }));
  }

  /** Herlaadt wanneer kanalen of teamlidmaatschappen veranderen (die bepalen de zichtbaarheid). */
  watch(onChange: () => void): () => void {
    return watchTables(this.db, ['channels', 'team_members'], onChange);
  }
}
