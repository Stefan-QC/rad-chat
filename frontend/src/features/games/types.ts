export type GameId = 'typerace' | 'tetris' | 'doom';
/** De games waarvan de uitslag bij een gestarte run (sessie) hoort; TypeRace-punten komen van de race zelf. */
export type SessionGame = 'tetris' | 'doom';

export interface GameInfo {
  id: GameId;
  name: string;
  description: string;
  route: string;
}

export const GAMES: GameInfo[] = [
  { id: 'typerace', name: 'TypeRace', description: 'Race your colleagues in real time. The fastest and most accurate typist wins.', route: '/typerace' },
  { id: 'tetris', name: 'Tetris', description: 'Stack the falling blocks, clear lines and chase a higher level.', route: '/games/tetris' },
  { id: 'doom', name: 'DOOM', description: 'Fight through three levels of a retro first-person shooter.', route: '/games/doom' },
];

export const gameName = (id: string): string => GAMES.find(game => game.id === id)?.name ?? id;

export interface GameScore {
  id: number;
  user_id: string;
  game: GameId;
  score: number;
  stats: Record<string, unknown>;
  ref: string;
  created_at: string;
}

export interface LeaderboardRow {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  score: number;
  achieved_at: string;
  stats: Record<string, unknown>;
}

export interface OverallRow {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  total: number;
  per_game: Partial<Record<GameId, { rank: number; players: number; score: number; points: number }>>;
}

export interface GameStats {
  best: number | null;
  played: number;
  last_score: number | null;
  last_at: string | null;
  position: number | null;
  players: number;
}

export interface MyStats {
  games: Partial<Record<GameId, GameStats>>;
  total_played: number;
  overall: { rank: number; total: number } | null;
}

/** Wat de server na het inleveren van een run terugstuurt. */
export type SubmittedScore = Pick<GameScore, 'id' | 'game' | 'score' | 'stats' | 'created_at'>;
