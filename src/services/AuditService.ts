import { unwrap, type Db } from '../core/supabase';
import type { AuditEntry } from '../core/types';

export interface AuditFilter {
  actionPrefix?: string;
  actorId?: string;
  limit?: number;
}

export class AuditService {
  constructor(private readonly db: Db) {}

  async list(filter: AuditFilter = {}): Promise<AuditEntry[]> {
    let query = this.db.from('audit_logs').select('*').order('id', { ascending: false }).limit(filter.limit ?? 200);
    if (filter.actionPrefix) query = query.like('action', `${filter.actionPrefix}%`);
    if (filter.actorId) query = query.eq('actor_id', filter.actorId);
    return unwrap(await query);
  }
}
