import { unwrap, type Db } from '../core/supabase';
import { watchTables } from '../core/realtime';
import type { Badge, CoffeePair, Kudo, QuizState, UserBadge } from '../core/types';

/** Kudos, de dagelijkse quiz, badges en koffie-matching. */
export class SocialService {
  constructor(private readonly db: Db) {}

  async listKudos(limit = 30): Promise<Kudo[]> {
    return unwrap(await this.db.from('kudos').select('*').order('created_at', { ascending: false }).limit(limit));
  }

  async giveKudos(toUser: string, message: string): Promise<number> {
    return unwrap(await this.db.rpc('give_kudos', { p_to: toUser, p_message: message }));
  }

  watchKudos(onChange: () => void): () => void {
    return watchTables(this.db, ['kudos'], onChange);
  }

  async quizToday(): Promise<QuizState> {
    return unwrap(await this.db.rpc('quiz_today'));
  }

  async answerQuiz(choice: number): Promise<QuizState> {
    return unwrap(await this.db.rpc('answer_quiz', { p_choice: choice }));
  }

  async badgeCatalog(): Promise<Badge[]> {
    return unwrap(await this.db.from('badges').select('*').order('sort'));
  }

  async earnedBadges(userId?: string): Promise<UserBadge[]> {
    let query = this.db.from('user_badges').select('*').order('earned_at', { ascending: false });
    if (userId) query = query.eq('user_id', userId);
    return unwrap(await query);
  }

  /** De koffiematch van deze week of de laatste die er was, voor de ingelogde gebruiker. */
  async latestCoffeePair(): Promise<(CoffeePair & { started_on: string }) | null> {
    const pairs = unwrap<CoffeePair[]>(await this.db.from('coffee_pairs').select('round_id, user_a, user_b, channel_id').order('round_id', { ascending: false }).limit(1));
    const pair = pairs[0];
    if (!pair) return null;
    const round = unwrap<{ started_on: string } | null>(await this.db.from('coffee_rounds').select('started_on').eq('id', pair.round_id).maybeSingle());
    return { ...pair, started_on: round?.started_on ?? '' };
  }
}
