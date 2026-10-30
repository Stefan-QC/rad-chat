import type { RacePlayer, RaceResult } from './typerace';

/** De voortgang die een speler zojuist heeft doorgegeven via de snelle (niet opgeslagen) verbinding. */
export interface LiveProgress {
  userId: string;
  correctChars: number;
  progress: number;
  wpm: number;
  accuracy: number;
  finished: boolean;
}

export interface StandingRow {
  userId: string;
  progress: number;
  wpm: number;
  accuracy: number;
  finished: boolean;
  finishedMs: number | null;
}

/**
 * Combineert de voortgang van alle deelnemers tot één ranglijst: de eigen cijfers komen rechtstreeks uit de engine,
 * de cijfers van anderen uit de snelle verbinding, en de opgeslagen uitslag vult aan voor wie niets doorgaf.
 */
export function liveStandings(
  participants: RacePlayer[],
  results: RaceResult[],
  live: Record<string, LiveProgress>,
  meId: string,
  own: LiveProgress | null,
): StandingRow[] {
  const rows = participants.map<StandingRow>(player => {
    const saved = results.find(result => result.user_id === player.user_id);
    const fast = player.user_id === meId ? own : live[player.user_id];
    const finished = Boolean(fast?.finished || saved?.finished);
    return {
      userId: player.user_id,
      progress: finished ? 100 : Math.max(fast?.progress ?? 0, saved?.progress ?? 0),
      wpm: fast?.wpm ?? saved?.wpm ?? 0,
      accuracy: fast?.accuracy ?? saved?.accuracy ?? 100,
      finished,
      finishedMs: saved?.finished_ms ?? null,
    };
  });
  return rows.sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return (a.finishedMs ?? Infinity) - (b.finishedMs ?? Infinity);
    if (a.progress !== b.progress) return b.progress - a.progress;
    return b.wpm - a.wpm;
  });
}
