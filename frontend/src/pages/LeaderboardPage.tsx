import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { isoDay } from '../core/format';
import { useAsync } from '../hooks/useAsync';

type Tab = 'people' | 'teams';
type Period = 'all' | 'month' | 'last';

/** Begin en einde (exclusief) van de gekozen periode als YYYY-MM-DD. */
function rangeOf(period: Period): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + (period === 'last' ? -1 : 0), 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return { from: isoDay(start), to: isoDay(end) };
}

const PERIODS: { id: Period; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: 'last', label: 'Last month' },
  { id: 'all', label: 'All time' },
];

function PeopleBoard({ period }: { period: Period }) {
  const { leaderboard } = useServices();
  const { me } = useAuth();
  const navigate = useNavigate();
  const load = useCallback(async () => {
    if (period === 'all') return (await leaderboard.users()).map(row => ({ ...row, detail: true }));
    const { from, to } = rangeOf(period);
    return (await leaderboard.usersPeriod(from, to)).map(row => ({ ...row, wordle_points: 0, craft_points: 0, detail: false }));
  }, [leaderboard, period]);
  const { data, loading, error, reload } = useAsync(load);
  useEffect(() => leaderboard.watch(() => void reload()), [leaderboard, reload]);
  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <div className="banner error">{error}</div>;
  const detail = period === 'all';
  return (
    <table className="table clickable">
      <thead><tr><th>#</th><th>Colleague</th>{detail && <><th className="num">Wordle</th><th className="num">Craft</th></>}<th className="num">{detail ? 'Total' : 'Points'}</th></tr></thead>
      <tbody>
        {data?.map((row, index) => (
          <tr key={row.user_id} className={row.user_id === me?.id ? 'me' : ''} onClick={() => navigate(`/profile/${row.user_id}`)}>
            <td className={`rank${index < 3 ? ' top' : ''}`}>{index + 1}</td>
            <td><span className="who-cell"><Avatar name={row.display_name} color={row.avatar_color} size="sm" />{row.display_name}</span></td>
            {detail && <><td className="num">{row.wordle_points}</td><td className="num">{row.craft_points}</td></>}
            <td className="num strong">{row.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TeamBoard({ period }: { period: Period }) {
  const { leaderboard } = useServices();
  const navigate = useNavigate();
  const load = useCallback(() => {
    if (period === 'all') return leaderboard.teams();
    const { from, to } = rangeOf(period);
    return leaderboard.teamsPeriod(from, to);
  }, [leaderboard, period]);
  const { data, loading, error, reload } = useAsync(load);
  useEffect(() => leaderboard.watch(() => void reload()), [leaderboard, reload]);
  const leader = useMemo(() => (data && data[0] && data[0].points > 0 ? data[0] : null), [data]);
  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <div className="banner error">{error}</div>;
  if (!data?.length) return <p className="muted">There are no teams yet.</p>;
  return (
    <>
      {period !== 'all' && leader && (
        <div className="banner ok team-leader" role="status">
          {period === 'month' ? '🏁 Currently leading this month: ' : '🏆 Winner of last month: '}<b>{leader.name}</b> with {leader.points} points
        </div>
      )}
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
    </>
  );
}

/** Ranglijst van collega's en teams, over een maand of alle tijd, live bijgewerkt zodra er punten bijkomen. */
export function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>('people');
  const [period, setPeriod] = useState<Period>('month');
  return (
    <>
      <PageHeader title="Leaderboard" />
      <div className="page">
        <div className="board-controls">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>Colleagues</button>
            <button role="tab" aria-selected={tab === 'teams'} className={tab === 'teams' ? 'on' : ''} onClick={() => setTab('teams')}>Teams</button>
          </div>
          <div className="tabs period" role="tablist" aria-label="Period">
            {PERIODS.map(item => (
              <button key={item.id} role="tab" aria-selected={period === item.id} className={period === item.id ? 'on' : ''} onClick={() => setPeriod(item.id)}>{item.label}</button>
            ))}
          </div>
        </div>
        <p className="muted">Points come from winning the daily Wordle, the daily quiz, kudos from colleagues and building in RAD Craft (max 100 a day).</p>
        {tab === 'people' ? <PeopleBoard period={period} /> : <TeamBoard period={period} />}
      </div>
    </>
  );
}
