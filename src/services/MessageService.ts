import { expectOk, unwrap, type Db } from '../core/supabase';
import type { Message } from '../core/types';

export const PAGE_SIZE = 50;

export interface OutgoingAttachment {
  kind: 'image' | 'gif';
  path?: string;
  url?: string;
  mime?: string;
  width?: number;
  height?: number;
  size?: number;
}

export interface SendOptions {
  parentId?: number | null;
  attachments?: OutgoingAttachment[];
}

export interface MessageListener {
  onInsert(message: Message): void;
  onUpdate(message: Message): void;
}

export class MessageService {
  constructor(private readonly db: Db) {}

  /** Haalt een pagina hoofdberichten op, nieuwste eerst teruggegeven in oplopende volgorde. */
  async listPage(channelId: string, beforeId?: number): Promise<Message[]> {
    let query = this.db.from('messages').select('*').eq('channel_id', channelId).is('parent_id', null).order('id', { ascending: false }).limit(PAGE_SIZE);
    if (beforeId !== undefined) query = query.lt('id', beforeId);
    return unwrap<Message[]>(await query).reverse();
  }

  async listReplies(parentId: number): Promise<Message[]> {
    return unwrap(await this.db.from('messages').select('*').eq('parent_id', parentId).order('id'));
  }

  async getById(id: number): Promise<Message | null> {
    return unwrap(await this.db.from('messages').select('*').eq('id', id).maybeSingle());
  }

  /** De server controleert rechten, lengte, draadregels en bijlagen. */
  async send(channelId: string, body: string, options: SendOptions = {}): Promise<Message> {
    return unwrap(await this.db.rpc('send_message', {
      p_channel: channelId, p_body: body, p_parent: options.parentId ?? null, p_attachments: options.attachments ?? [],
    }));
  }

  async edit(id: number, body: string): Promise<void> {
    expectOk(await this.db.rpc('edit_message', { p_id: id, p_body: body }));
  }

  async remove(id: number): Promise<void> {
    expectOk(await this.db.rpc('delete_message', { p_id: id }));
  }

  /** Luistert naar nieuwe en gewijzigde berichten van een kanaal, inclusief antwoorden in draadjes. */
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
