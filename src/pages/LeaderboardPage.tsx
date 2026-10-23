import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { useAsync } from '../hooks/useAsync';

type Tab = 'people' | 'teams';

function PeopleBoard() {
  const { leaderboard } = useServices();
  const { me } = useAuth();
  const navigate = useNavigate();
  const load = useCallback(() => leaderboard.users(), [leaderboard]);
  const { data, loading, error, reload } = useAsync(load);
  useEffect(() => leaderboard.watch(() => void reload()), [leaderboard, reload]);
  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <div className="banner error">{error}</div>;
  return (
    <table className="table clickable">
      <thead><tr><th>#</th><th>Colleague</th><th className="num">Wordle</th><th className="num">Craft</th><th className="num">Total</th></tr></thead>
      <tbody>
        {data?.map((row, index) => (
          <tr key={row.user_id} className={row.user_id === me?.id ? 'me' : ''} onClick={() => navigate(`/profile/${row.user_id}`)}>
            <td className={`rank${index < 3 ? ' top' : ''}`}>{index + 1}</td>
            <td><span className="who-cell"><Avatar name={row.display_name} color={row.avatar_color} size="sm" />{row.display_name}</span></td>
            <td className="num">{row.wordle_points}</td>
            <td className="num">{row.craft_points}</td>
            <td className="num strong">{row.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TeamBoard() {
  const { leaderboard } = useServices();
  const navigate = useNavigate();
  const load = useCallback(() => leaderboard.teams(), [leaderboard]);
  const { data, loading, error, reload } = useAsync(load);
  useEffect(() => leaderboard.watch(() => void reload()), [leaderboard, reload]);
  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <div className="banner error">{error}</div>;
  if (!data?.length) return <p className="muted">There are no teams yet.</p>;
  return (
    <table className="table clickable">
      <thead><tr><th>#</th><th>Team</th><th className="num">Members</th><th className="num">Points</th></tr></thead>
      <tbody>
        {data.map((row, index) => (
          <tr key={row.team_id} onClick={() => navigate(`/teams/${row.team_id}`)}>
            <td className={`rank${index < 3 ? ' top' : ''}`}>{index + 1}</td>
            <td><span className="who-cell"><span className="team-dot" style={{ background: row.color }} />{row.name}</span></td>
            <td className="num">{row.members}</td>
            <td className="num strong">{row.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Ranglijst van collega's en teams, live bijgewerkt zodra er punten bijkomen. */
export function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>('people');
  return (
    <>
      <PageHeader title="Leaderboard" />
      <div className="page">
        <div className="tabs">
          <button className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>Colleagues</button>
          <button className={tab === 'teams' ? 'on' : ''} onClick={() => setTab('teams')}>Teams</button>
        </div>
        <p className="muted">Points come from winning the daily Wordle and building in RAD Craft (max 100 a day).</p>
        {tab === 'people' ? <PeopleBoard /> : <TeamBoard />}
      </div>
    </>
  );
}
