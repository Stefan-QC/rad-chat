import { useCallback } from 'react';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { formatDateTime, formatDuration } from '../../core/format';
import { useAsync } from '../../hooks/useAsync';

/** Recente voice- en gamesessies. */
export function SessionsTab() {
  const { activity } = useServices();
  const { profileById, channels } = useWorkspace();
  const load = useCallback(() => activity.listRecent(150), [activity]);
  const { data, loading, error } = useAsync(load);
  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <div className="banner error">{error}</div>;
  return (
    <div className="table-scroll">
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
    </div>
  );
}
