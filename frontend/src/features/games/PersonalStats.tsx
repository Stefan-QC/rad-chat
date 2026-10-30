import { useCallback, useEffect } from 'react';
import { useServices } from '../../app/ServicesContext';
import { formatDateTime } from '../../core/format';
import { useAsync } from '../../hooks/useAsync';
import { GAMES, type GameId, type MyStats } from './types';

/** Laadt de persoonlijke statistieken van de speler en ververst ze wanneer er een nieuwe score binnenkomt. */
export function useMyStats(): { stats: MyStats | null; loading: boolean; reload: () => Promise<void> } {
  const { games } = useServices();
  const load = useCallback(() => games.myStats(), [games]);
  const { data, loading, reload } = useAsync(load);
  useEffect(() => games.watch(() => void reload()), [games, reload]);
  return { stats: data, loading, reload };
}

const fmt = (value: number | null | undefined) => (value === null || value === undefined ? '–' : value.toLocaleString('en-US'));

/** De persoonlijke highscore, het aantal gespeelde games, de laatste score en de positie op het klassement, per game. */
export function PersonalStats({ only }: { only?: GameId }) {
  const { stats, loading } = useMyStats();
  if (loading && !stats) return <p className="muted">Loading…</p>;
  if (!stats) return null;
  const games = GAMES.filter(game => !only || game.id === only);
  return (
    <section className="gm-stats" aria-label="Your statistics">
      {!only && (
        <div className="gm-stat-head">
          <div><b>{stats.total_played}</b><small>games played</small></div>
          <div><b>{stats.overall ? `#${stats.overall.rank}` : '–'}</b><small>overall position</small></div>
          <div><b>{stats.overall ? stats.overall.total : '–'}</b><small>rank points</small></div>
        </div>
      )}
      <div className="gm-stat-grid">
        {games.map(game => {
          const entry = stats.games[game.id];
          return (
            <div className="gm-stat-card" key={game.id}>
              <h4>{game.name}</h4>
              <dl>
                <div><dt>Highscore</dt><dd>{fmt(entry?.best)}</dd></div>
                <div><dt>Played</dt><dd>{entry?.played ?? 0}</dd></div>
                <div><dt>Last score</dt><dd>{fmt(entry?.last_score)}{entry?.last_at && <small title={formatDateTime(entry.last_at)}> · {formatDateTime(entry.last_at)}</small>}</dd></div>
                <div><dt>Position</dt><dd>{entry?.position ? `#${entry.position} of ${entry.players}` : '–'}</dd></div>
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}
