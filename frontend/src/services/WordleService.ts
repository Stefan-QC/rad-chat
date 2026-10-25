import { unwrap, type Db } from '../core/supabase';
import type { WordleState, WordleStats } from '../core/types';

/** Praat met de database: het doelwoord blijft op de server, de client krijgt alleen de beoordeling terug. */
export class WordleService {
  constructor(private readonly db: Db) {}

  async state(): Promise<WordleState> {
    return unwrap(await this.db.rpc('wordle_state'));
  }

  async guess(word: string): Promise<WordleState> {
    return unwrap(await this.db.rpc('wordle_guess', { p_word: word }));
  }

  async stats(): Promise<WordleStats> {
    return unwrap(await this.db.rpc('wordle_stats'));
  }
}
