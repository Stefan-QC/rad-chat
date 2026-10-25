import { useCallback, useState } from 'react';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { formatDateTime } from '../../core/format';
import { useAsync } from '../../hooks/useAsync';

const PREFIXES = ['', 'auth.', 'profile.', 'team.', 'channel.', 'message.', 'admin.', 'wordle.', 'voice.', 'craft.'];

/** De audit log met een filter op soort actie. */
export function AuditTab() {
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
        <div className="table-scroll">
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
        </div>
      )}
    </>
  );
}
