import { expectOk, unwrap, type Db } from '../core/supabase';
import type { PinnedMessage } from '../core/types';

export class PinService {
  constructor(private readonly db: Db) {}

  async list(channelId: string): Promise<PinnedMessage[]> {
    return unwrap(await this.db.from('pinned_messages').select('*').eq('channel_id', channelId).order('pinned_at', { ascending: false }));
  }

  async pin(messageId: number): Promise<void> {
    expectOk(await this.db.rpc('pin_message', { p_message: messageId }));
  }

  async unpin(messageId: number): Promise<void> {
    expectOk(await this.db.rpc('unpin_message', { p_message: messageId }));
  }

  subscribe(channelId: string, onChange: () => void): () => void {
    const channel = this.db
      .channel(`pins-${channelId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages', filter: `channel_id=eq.${channelId}` }, () => onChange())
      .subscribe();
    return () => {
      void this.db.removeChannel(channel);
    };
  }
}
