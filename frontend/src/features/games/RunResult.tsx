import type { ReactNode } from 'react';
import { GameLeaderboard } from './Leaderboards';
import type { RunRecorder } from './RunRecorder';
import type { GameId } from './types';

interface RunResultProps {
  title: string;
  game: GameId;
  score: number;
  rows: [string, string | number][];
  recorder: RunRecorder | null;
  /** De server-versie van de score (die telt); als de aanroep nog loopt staat hier de score van het spel. */
  children?: ReactNode;
}

const SAVE_TEXT: Record<string, string> = {
  idle: '',
  starting: 'Saving your score…',
  ready: 'Saving your score…',
  submitting: 'Saving your score…',
  saved: 'Score saved.',
  failed: 'The server refused this score.',
  unavailable: 'Scores cannot be saved right now (the game database is not ready).',
  skipped: 'No points scored, so there is nothing to save.',
};

/** Het scherm na een run: de score zoals de server die vastlegde, de statistieken, de opslagstatus en de top van het klassement. */
export function RunResult({ title, game, score, rows, recorder, children }: RunResultProps) {
  const serverScore = recorder?.saved?.score;
  return (
    <div className="gm-result" role="dialog" aria-label={title}>
      <h2>{title}</h2>
      <div className="gm-big">{(serverScore ?? score).toLocaleString('en-US')}</div>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'contents' }}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <p className="gm-saved" role="status">{recorder ? SAVE_TEXT[recorder.state] : ''}{recorder?.state === 'failed' && recorder.error ? ` (${recorder.error})` : ''}</p>
      {recorder?.state === 'saved' && <div className="gm-mini-board"><GameLeaderboard game={game} limit={5} /></div>}
      {children}
    </div>
  );
}
