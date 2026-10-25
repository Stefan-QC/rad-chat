import { expectOk, unwrap, type Db } from '../core/supabase';
import { watchTables } from '../core/realtime';
import type { Decision, MeetingNote } from '../core/types';

export interface MeetingDraft {
  id?: number | null;
  teamId: string | null;
  title: string;
  heldAt: string;
  attendees: string[];
  notes: string;
}

export class MeetingService {
  constructor(private readonly db: Db) {}

  async listMeetings(): Promise<MeetingNote[]> {
    return unwrap(await this.db.from('meeting_notes').select('*').order('held_at', { ascending: false }));
  }

  async listDecisions(): Promise<Decision[]> {
    return unwrap(await this.db.from('decisions').select('*').order('decided_on', { ascending: false }).order('id', { ascending: false }));
  }

  async save(draft: MeetingDraft): Promise<number> {
    return unwrap(await this.db.rpc('save_meeting', {
      p_id: draft.id ?? null, p_team: draft.teamId, p_title: draft.title, p_held_at: draft.heldAt, p_attendees: draft.attendees, p_notes: draft.notes,
    }));
  }

  async addDecision(meetingId: number, text: string): Promise<number> {
    return unwrap(await this.db.rpc('add_decision', { p_meeting: meetingId, p_text: text }));
  }

  async removeDecision(id: number): Promise<void> {
    expectOk(await this.db.rpc('delete_decision', { p_id: id }));
  }

  async remove(meetingId: number): Promise<void> {
    expectOk(await this.db.rpc('delete_meeting', { p_id: meetingId }));
  }

  watch(onChange: () => void): () => void {
    return watchTables(this.db, ['meeting_notes', 'decisions'], onChange);
  }
}
