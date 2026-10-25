import { unwrap, type Db } from '../core/supabase';
import type { Message } from '../core/types';

/** Zoekt in berichten; de database beperkt de resultaten tot kanalen die de gebruiker mag lezen. */
export class SearchService {
  constructor(private readonly db: Db) {}

  async messages(query: string, channelId?: string, limit = 20): Promise<Message[]> {
    const text = query.trim();
    if (text.length < 2) return [];
    return unwrap(await this.db.rpc('search_messages', { p_query: text, p_channel: channelId ?? null, p_limit: limit }));
  }
}
