import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { Avatar } from '../../components/Avatar';
import { formatDateTime } from '../../core/format';
import { useAsync } from '../../hooks/useAsync';
import { GAMES, gameName, type GameId, type LeaderboardRow, type OverallRow } from './types';

type Board = 'overall' | GameId;

/** Eén klassement met de top 10 van een game: positie, speler, score en de datum waarop die score werd gehaald. */
export function GameLeaderboard({ game, limit = 10 }: { game: GameId; limit?: number }) {
  const { games } = useServices();
  const { me } = useAuth();
  const load = useCallback(() => games.leaderboard(game, limit), [games, game, limit]);
  const { data, loading, error, reload } = useAsync(load);
  useEffect(() => games.watch(() => void reload()), [games, reload]);

  if (loading && !data) return <p className="muted">Loading…</p>;
  if (error) return <div className="banner error">{error}</div>;
  if (!data?.length) return <p className="muted">No scores for {gameName(game)} yet. Be the first!</p>;
  return <BoardTable rows={data} meId={me?.id} />;
}

function BoardTable({ rows, meId }: { rows: LeaderboardRow[]; meId?: string }) {
  return (
    <table className="table gm-board">
      <thead><tr><th>#</th><th>Player</th><th className="num">Score</th><th>Date</th></tr></thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.user_id} className={row.user_id === meId ? 'me' : ''}>
            <td className={`rank${row.rank <= 3 ? ' top' : ''}`}>{row.rank}</td>
            <td><span className="who-cell"><Avatar name={row.display_name} color={row.avatar_color} size="sm" />{row.display_name}<small className="muted">@{row.username}</small></span></td>
            <td className="num strong">{row.score.toLocaleString('en-US')}</td>
            <td className="nowrap muted">{formatDateTime(row.achieved_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Het algemene klassement: rangpunten per game (0 tot 100), zodat de verschillende puntenschalen eerlijk tegen elkaar wegen. */
export function OverallLeaderboard({ limit = 10 }: { limit?: number }) {
  const { games } = useServices();
  const { me } = useAuth();
  const load = useCallback(() => games.overall(limit), [games, limit]);
  const { data, loading, error, reload } = useAsync(load);
  useEffect(() => games.watch(() => void reload()), [games, reload]);

  if (loading && !data) return <p className="muted">Loading…</p>;
  if (error) return <div className="banner error">{error}</div>;
  if (!data?.length) return <p className="muted">Nobody has scored yet.</p>;
  return (
    <>
      <p className="muted gm-note">
        In each game the best player earns 100 points, the next one a little less, and so on. Your overall score adds up these rank points, so every game counts equally.
      </p>
      <table className="table gm-board">
        <thead>
          <tr><th>#</th><th>Player</th>{GAMES.map(game => <th key={game.id} className="num">{game.name}</th>)}<th className="num">Total</th></tr>
        </thead>
        <tbody>
          {data.map((row: OverallRow) => (
            <tr key={row.user_id} className={row.user_id === me?.id ? 'me' : ''}>
              <td className={`rank${row.rank <= 3 ? ' top' : ''}`}>{row.rank}</td>
              <td><span className="who-cell"><Avatar name={row.display_name} color={row.avatar_color} size="sm" />{row.display_name}</span></td>
              {GAMES.map(game => {
                const entry = row.per_game[game.id];
                return <td key={game.id} className="num">{entry ? <>{entry.points}<small className="muted"> #{entry.rank}</small></> : <span className="muted">–</span>}</td>;
              })}
              <td className="num strong">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Tabbladen met het algemene klassement en één klassement per game. */
export function Leaderboards({ initial = 'overall' }: { initial?: Board }) {
  const [board, setBoard] = useState<Board>(initial);
  return (
    <section className="gm-boards" aria-label="Leaderboards">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={board === 'overall'} className={board === 'overall' ? 'on' : ''} onClick={() => setBoard('overall')}>Overall</button>
        {GAMES.map(game => (
          <button key={game.id} role="tab" aria-selected={board === game.id} className={board === game.id ? 'on' : ''} onClick={() => setBoard(game.id)}>{game.name}</button>
        ))}
      </div>
      {board === 'overall' ? <OverallLeaderboard /> : <GameLeaderboard game={board} />}
    </section>
  );
}
