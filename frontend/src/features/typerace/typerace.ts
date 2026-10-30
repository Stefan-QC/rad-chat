export type RaceStatus = 'lobby' | 'countdown' | 'playing' | 'finished';
export type RaceLanguage = 'nl' | 'en';
export type RaceDuration = 15 | 30 | 60;

/** De fase zoals de browser hem toont; 'settling' is het korte moment na de tijd waarop de laatste uitslagen binnenkomen. */
export type RacePhase = 'lobby' | 'countdown' | 'playing' | 'settling' | 'finished';

export const COUNTDOWN_SECONDS = 3;
export const SETTLE_MS = 2000;

export interface RaceLobby {
  id: string;
  host_id: string;
  language: RaceLanguage;
  duration_seconds: RaceDuration;
  status: RaceStatus;
  round: number;
  text: string | null;
  countdown_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface RacePlayer {
  lobby_id: string;
  user_id: string;
  play_from: number;
  joined_at: string;
  last_seen: string;
}

export interface RaceResult {
  lobby_id: string;
  round: number;
  user_id: string;
  correct_chars: number;
  keystrokes: number;
  correct_keystrokes: number;
  wpm: number;
  accuracy: number;
  progress: number;
  finished: boolean;
  finished_ms: number | null;
}

export interface OpenLobby {
  lobby_id: string;
  host_id: string;
  language: RaceLanguage;
  duration_seconds: RaceDuration;
  status: RaceStatus;
  players: number;
}

export interface RankedResult extends RaceResult {
  place: number;
}

/** Leest een tijdstempel van de database; de microseconden worden afgekapt omdat niet elke browser ze begrijpt. */
export function parseTime(value: string): number {
  return Date.parse(value.replace(/(\.\d{3})\d+/, '$1'));
}

/** Bepaalt de fase uit de tijden van de server; `serverNow` is de tijd van de server in milliseconden. */
export function racePhase(lobby: Pick<RaceLobby, 'status' | 'starts_at' | 'ends_at'>, serverNow: number): RacePhase {
  if (lobby.status === 'lobby') return 'lobby';
  if (lobby.status === 'finished' || !lobby.starts_at || !lobby.ends_at) return 'finished';
  const starts = parseTime(lobby.starts_at);
  const ends = parseTime(lobby.ends_at);
  if (serverNow < starts) return 'countdown';
  if (serverNow < ends) return 'playing';
  return serverNow < ends + SETTLE_MS ? 'settling' : 'finished';
}

/** Rangschikt de uitslag: wie klaar is eerst op eindtijd, daarna op juiste voortgang, en bij gelijkspel op WPM. */
export function rankResults(results: RaceResult[]): RankedResult[] {
  const sorted = [...results].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return (a.finished_ms ?? 0) - (b.finished_ms ?? 0);
    if (a.progress !== b.progress) return b.progress - a.progress;
    if (a.wpm !== b.wpm) return b.wpm - a.wpm;
    return a.user_id.localeCompare(b.user_id);
  });
  return sorted.map((result, index) => ({ ...result, place: index + 1 }));
}

/** Zet de tijd om naar seconden met één decimaal, bijvoorbeeld 12.3s. */
export function formatFinish(ms: number | null): string {
  return ms === null ? '–' : `${(ms / 1000).toFixed(1)}s`;
}

/** Vertaalt een fout uit de database naar een zin voor de speler. */
export function raceErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    lobby_full: 'This lobby is full (8 players).',
    not_found: 'This lobby no longer exists.',
    round_in_progress: 'A round is already running.',
    forbidden: 'You cannot do that in this lobby.',
  };
  return messages[code] ?? 'Something went wrong. Try again.';
}
