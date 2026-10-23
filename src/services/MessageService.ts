import { expectOk, unwrap, type Db } from '../core/supabase';
import type { Message } from '../core/types';

export const PAGE_SIZE = 50;

export interface MessageListener {
  onInsert(message: Message): void;
  onUpdate(message: Message): void;
}

export class MessageService {
  constructor(private readonly db: Db) {}

  /** Haalt een pagina berichten op, nieuwste eerst teruggegeven in oplopende volgorde. */
  async listPage(channelId: string, beforeId?: number): Promise<Message[]> {
    let query = this.db.from('messages').select('*').eq('channel_id', channelId).order('id', { ascending: false }).limit(PAGE_SIZE);
    if (beforeId !== undefined) query = query.lt('id', beforeId);
    const rows = unwrap<Message[]>(await query);
    return rows.reverse();
  }

  async send(channelId: string, userId: string, body: string): Promise<Message> {
    return unwrap(await this.db.from('messages').insert({ channel_id: channelId, user_id: userId, body: body.trim() }).select().single());
  }

  async edit(id: number, body: string): Promise<void> {
    expectOk(await this.db.rpc('edit_message', { p_id: id, p_body: body }));
  }

  async remove(id: number): Promise<void> {
    expectOk(await this.db.rpc('delete_message', { p_id: id }));
  }

  subscribe(channelId: string, listener: MessageListener): () => void {
    const channel = this.db
      .channel(`messages-${channelId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        payload => listener.onInsert(payload.new as Message))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        payload => listener.onUpdate(payload.new as Message))
      .subscribe();
    return () => {
      void this.db.removeChannel(channel);
    };
  }
}
