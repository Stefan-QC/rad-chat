import { expectOk, unwrap, type Db } from '../core/supabase';
import { watchTables } from '../core/realtime';
import type { Task } from '../core/types';

export interface TaskDraft {
  title: string;
  description?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  teamId?: string | null;
  messageId?: number | null;
  meetingId?: number | null;
}

export class TaskService {
  constructor(private readonly db: Db) {}

  async list(): Promise<Task[]> {
    return unwrap(await this.db.from('tasks').select('*').order('status').order('due_date', { ascending: true, nullsFirst: false }).order('id', { ascending: false }));
  }

  async create(draft: TaskDraft): Promise<number> {
    return unwrap(await this.db.rpc('create_task', {
      p_title: draft.title, p_description: draft.description ?? null, p_assignee: draft.assigneeId ?? null, p_due: draft.dueDate ?? null,
      p_team: draft.teamId ?? null, p_message: draft.messageId ?? null, p_meeting: draft.meetingId ?? null,
    }));
  }

  async update(id: number, draft: TaskDraft): Promise<void> {
    expectOk(await this.db.rpc('update_task', {
      p_id: id, p_title: draft.title, p_description: draft.description ?? null, p_assignee: draft.assigneeId ?? null, p_due: draft.dueDate ?? null,
    }));
  }

  async setStatus(id: number, status: Task['status']): Promise<void> {
    expectOk(await this.db.rpc('set_task_status', { p_id: id, p_status: status }));
  }

  async remove(id: number): Promise<void> {
    expectOk(await this.db.rpc('delete_task', { p_id: id }));
  }

  watch(onChange: () => void): () => void {
    return watchTables(this.db, ['tasks'], onChange);
  }
}
