import type { RealtimeChannel } from '@supabase/supabase-js';
import { Emitter } from '../core/Emitter';
import type { Db } from '../core/supabase';

/** Houdt bij welke gebruikers online zijn via een gedeeld Realtime-presencekanaal. */
export class LobbyPresence extends Emitter<{ change: string[] }> {
  private channel: RealtimeChannel | null = null;

  constructor(private readonly db: Db) {
    super();
  }

  join(userId: string): void {
    this.leave();
    const channel = this.db.channel('lobby', { config: { private: true, presence: { key: userId } } });
    channel.on('presence', { event: 'sync' }, () => this.emit('change', Object.keys(channel.presenceState())));
    channel.subscribe(async status => {
      if (status === 'SUBSCRIBED') await channel.track({ since: Date.now() });
    });
    this.channel = channel;
  }

  leave(): void {
    if (!this.channel) return;
    void this.db.removeChannel(this.channel);
    this.channel = null;
    this.emit('change', []);
  }
}
