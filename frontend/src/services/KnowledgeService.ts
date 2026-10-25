import { expectOk, unwrap, type Db } from '../core/supabase';
import { watchTables } from '../core/realtime';
import type { KbPage, KbVersion } from '../core/types';

export interface KbDraft {
  id?: number | null;
  teamId: string | null;
  title: string;
  body: string;
  category?: string;
  pinned?: boolean;
}

export class KnowledgeService {
  constructor(private readonly db: Db) {}

  async listPages(): Promise<KbPage[]> {
    return unwrap(await this.db.from('kb_pages').select('id, team_id, title, body, category, pinned, created_by, updated_by, created_at, updated_at').order('pinned', { ascending: false }).order('title'));
  }

  async listVersions(pageId: number): Promise<KbVersion[]> {
    return unwrap(await this.db.from('kb_versions').select('*').eq('page_id', pageId).order('version', { ascending: false }));
  }

  async save(draft: KbDraft): Promise<number> {
    return unwrap(await this.db.rpc('save_kb_page', {
      p_id: draft.id ?? null, p_team: draft.teamId, p_title: draft.title, p_body: draft.body, p_category: draft.category ?? null, p_pinned: draft.pinned ?? false,
    }));
  }

  async remove(pageId: number): Promise<void> {
    expectOk(await this.db.rpc('delete_kb_page', { p_id: pageId }));
  }

  watch(onChange: () => void): () => void {
    return watchTables(this.db, ['kb_pages'], onChange);
  }
}
