import { debounce, watchTables } from '../core/realtime';
import { unwrap, type Db } from '../core/supabase';
import type { GameScore, LeaderboardRow, MyStats, OverallRow, SessionGame, SubmittedScore, GameId } from '../features/games/types';

/**
 * Het centrale scoresysteem van alle games. De database bepaalt elke score: een game meldt alleen wat er gebeurd is
 * (de gebeurtenissen van een run) en de server rekent de score zelf uit en weigert onmogelijke meldingen.
 */
export class GameService {
  constructor(private readonly db: Db) {}

  /** Opent een run; een sessie kan precies één keer worden ingeleverd. */
  async start(game: SessionGame): Promise<string> {
    return unwrap<string>(await this.db.rpc('game_start', { p_game: game }));
  }

  /** Levert de gebeurtenissen van een run in; de teruggegeven score is wat de server heeft vastgelegd. */
  async submit(sessionId: string, report: object): Promise<SubmittedScore> {
    return unwrap<SubmittedScore>(await this.db.rpc('game_submit', { p_session: sessionId, p_report: report }));
  }

  async leaderboard(game: GameId, limit = 10): Promise<LeaderboardRow[]> {
    return unwrap<LeaderboardRow[]>(await this.db.rpc('game_leaderboard', { p_game: game, p_limit: limit }));
  }

  /** Het algemene klassement op rangpunten per game, dus niet op opgetelde ruwe punten. */
  async overall(limit = 10): Promise<OverallRow[]> {
    return unwrap<OverallRow[]>(await this.db.rpc('game_overall', { p_limit: limit }));
  }

  async myStats(): Promise<MyStats> {
    return unwrap<MyStats>(await this.db.rpc('game_my_stats'));
  }

  /** De scores van één TypeRace-ronde, zodat de uitslag het basisscore-, bonus- en totaalbedrag kan tonen. */
  async typeRaceScores(lobbyId: string, round: number): Promise<GameScore[]> {
    return unwrap<GameScore[]>(await this.db.from('game_scores').select('*').eq('game', 'typerace').like('ref', `typerace:${lobbyId}:${round}:%`));
  }

  /** Meldt nieuwe scores, gebundeld, zodat klassementen zichzelf verversen. */
  watch(onChange: () => void): () => void {
    return watchTables(this.db, ['game_scores'], debounce(onChange, 500));
  }
}
