import { expectOk, unwrap, type Db } from '../core/supabase';
import type { AppNotification, UnreadEntry } from '../core/types';

export class NotificationService {
  constructor(private readonly db: Db) {}

  async list(limit = 50): Promise<AppNotification[]> {
    return unwrap(await this.db.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit));
  }

  async unread(): Promise<UnreadEntry[]> {
    return unwrap(await this.db.rpc('my_unread'));
  }

  async markRead(ids?: number[]): Promise<void> {
    expectOk(await this.db.rpc('mark_notifications_read', { p_ids: ids ?? null }));
  }

  async markChannelRead(channelId: string, messageId: number): Promise<void> {
    expectOk(await this.db.rpc('mark_channel_read', { p_channel: channelId, p_message: messageId }));
  }

  /** Luistert naar nieuwe meldingen van één gebruiker. */
  subscribe(userId: string, onInsert: (notification: AppNotification) => void): () => void {
    const channel = this.db
      .channel(`notifications-${userId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        payload => onInsert(payload.new as AppNotification))
      .subscribe();
    return () => {
      void this.db.removeChannel(channel);
    };
  }
}
