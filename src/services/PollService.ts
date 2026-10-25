import { expectOk, unwrap, type Db } from '../core/supabase';
import { debounce, watchTables } from '../core/realtime';
import type { Poll, PollData, PollOption, PollVote } from '../core/types';

export interface PollDraft {
  question: string;
  options: string[];
  multiple: boolean;
  closesAt: string | null;
}

export class PollService {
  constructor(private readonly db: Db) {}

  async create(channelId: string, draft: PollDraft): Promise<number> {
    return unwrap(await this.db.rpc('create_poll', {
      p_channel: channelId, p_question: draft.question, p_options: draft.options, p_multiple: draft.multiple, p_closes_at: draft.closesAt,
    }));
  }

  async vote(optionId: number): Promise<void> {
    expectOk(await this.db.rpc('vote_poll', { p_option: optionId }));
  }

  /** Haalt peilingen, opties en stemmen op voor de opgegeven peilingberichten. */
  async listForMessages(messageIds: number[]): Promise<PollData[]> {
    if (messageIds.length === 0) return [];
    const polls = unwrap<Poll[]>(await this.db.from('polls').select('*').in('message_id', messageIds));
    if (polls.length === 0) return [];
    const ids = polls.map(p => p.id);
    const [options, votes] = await Promise.all([
      this.db.from('poll_options').select('*').in('poll_id', ids).order('position'),
      this.db.from('poll_votes').select('poll_id, option_id, user_id').in('poll_id', ids),
    ]);
    const optionRows = unwrap<PollOption[]>(options);
    const voteRows = unwrap<PollVote[]>(votes);
    return polls.map(poll => ({ poll, options: optionRows.filter(o => o.poll_id === poll.id), votes: voteRows.filter(v => v.poll_id === poll.id) }));
  }

  /** Stemmen kunnen snel achter elkaar binnenkomen, dus meldingen worden gebundeld. */
  watch(onChange: () => void): () => void {
    return watchTables(this.db, ['poll_votes', 'polls'], debounce(onChange, 300));
  }
}
