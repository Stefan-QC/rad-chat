import { unwrap, type Db } from '../core/supabase';
import type { Reaction } from '../core/types';

export interface ReactionEvent {
  type: 'add' | 'remove';
  reaction: Reaction;
}

export class ReactionService {
  constructor(private readonly db: Db) {}

  async listForMessages(messageIds: number[]): Promise<Reaction[]> {
    if (messageIds.length === 0) return [];
    return unwrap(await this.db.from('message_reactions').select('message_id, user_id, emoji').in('message_id', messageIds));
  }

  /** Geeft true terug als de reactie is toegevoegd en false als die is weggehaald. */
  async toggle(messageId: number, emoji: string): Promise<boolean> {
    return unwrap(await this.db.rpc('toggle_reaction', { p_message: messageId, p_emoji: emoji }));
  }

  /** Luistert naar alle reacties die de gebruiker mag zien; de database filtert op toegang. */
  subscribe(onEvent: (event: ReactionEvent) => void): () => void {
    const channel = this.db
      .channel(`reactions-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        payload => onEvent({ type: 'add', reaction: payload.new as Reaction }))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        payload => onEvent({ type: 'remove', reaction: payload.old as Reaction }))
      .subscribe();
    return () => {
      void this.db.removeChannel(channel);
    };
  }
}
