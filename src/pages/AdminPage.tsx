import { useCallback, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { useWorkspace } from '../app/WorkspaceContext';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { messageOf } from '../core/AppError';
import { formatDateTime, formatDuration } from '../core/format';
import type { Role } from '../core/types';
import { useAsync } from '../hooks/useAsync';

type Tab = 'audit' | 'users' | 'sessions';

const PREFIXES = ['', 'auth.', 'profile.', 'team.', 'message.', 'channel.', 'wordle.', 'voice.', 'craft.'];

function AuditTab() {
  const { audit } = useServices();
  const { profileById } = useWorkspace();
  const [prefix, setPrefix] = useState('');
  const load = useCallback(() => audit.list({ actionPrefix: prefix || undefined }), [audit, prefix]);
  const { data, loading, error, reload } = useAsync(load);
  return (
    <>
      <div className="toolbar">
        <select className="text-input" value={prefix} onChange={e => setPrefix(e.target.value)} aria-label="Filter by action">
          {PREFIXES.map(p => <option key={p} value={p}>{p ? `${p}*` : 'All actions'}</option>)}
        </select>
        <button className="btn secondary small" onClick={() => void reload()}>Refresh</button>
      </div>
      {error && <div className="banner error">{error}</div>}
      {loading ? <p className="muted">Loading…</p> : (
        <table className="table audit">
          <thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            {data?.map(entry => (
              <tr key={entry.id}>
                <td className="nowrap">{formatDateTime(entry.created_at)}</td>
                <td>{profileById(entry.actor_id)?.display_name ?? (entry.actor_id ? 'Unknown' : 'System')}</td>
                <td><code>{entry.action}</code></td>
                <td className="nowrap">{entry.entity_type}{entry.entity_id ? ` ${entry.entity_id.slice(0, 8)}` : ''}</td>
                <td className="details">{Object.keys(entry.metadata).length ? JSON.stringify(entry.metadata) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function UsersTab() {
  const { profiles: service } = useServices();
  const { me } = useAuth();
  const { profiles, onlineIds } = useWorkspace();
  const [error, setError] = useState<string | null>(null);

  const changeRole = async (userId: string, role: Role) => {
    try {
      setError(null);
      await service.setRole(userId, role);
    } catch (e) {
      setError(messageOf(e));
    }
  };

  return (
    <>
      {error && <div className="banner error">{error}</div>}
      <p className="muted">New accounts are created in Supabase under Authentication → Users.</p>
      <table className="table">
        <thead><tr><th>Colleague</th><th>Username</th><th>Role</th><th>Status</th></tr></thead>
        <tbody>
          {profiles.map(profile => (
            <tr key={profile.id}>
              <td><span className="who-cell"><Avatar name={profile.display_name} color={profile.avatar_color} size="sm" />{profile.display_name}</span></td>
              <td>@{profile.username}</td>
              <td>
                <select className="text-input small" value={profile.role} disabled={profile.id === me?.id} onChange={e => void changeRole(profile.id, e.target.value as Role)}>
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td>{onlineIds.has(profile.id) ? 'online' : 'offline'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function SessionsTab() {
  const { activity } = useServices();
  const { profileById, channels } = useWorkspace();
  const load = useCallback(() => activity.listRecent(150), [activity]);
  const { data, loading, error } = useAsync(load);
  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <div className="banner error">{error}</div>;
  return (
    <table className="table">
      <thead><tr><th>Started</th><th>Who</th><th>Activity</th><th>Where</th><th className="num">Duration</th></tr></thead>
      <tbody>
        {data?.map(session => (
          <tr key={session.id}>
            <td className="nowrap">{formatDateTime(session.started_at)}</td>
            <td>{profileById(session.user_id)?.display_name ?? 'Unknown'}</td>
            <td>{session.kind}</td>
            <td>{channels.find(c => c.id === session.ref)?.name ?? session.ref ?? ''}</td>
            <td className="num">{session.ended_at ? formatDuration(session.started_at, session.ended_at) : 'active'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Beheerpagina met audit log, gebruikersrollen en recente voice- en gamesessies. */
export function AdminPage() {
  const { me } = useAuth();
  const [tab, setTab] = useState<Tab>('audit');
  if (me?.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <>
      <PageHeader title="Admin" />
      <div className="page wide">
        <div className="tabs">
          <button className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>Audit log</button>
          <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Users</button>
          <button className={tab === 'sessions' ? 'on' : ''} onClick={() => setTab('sessions')}>Sessions</button>
        </div>
        {tab === 'audit' && <AuditTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'sessions' && <SessionsTab />}
      </div>
    </>
  );
}
