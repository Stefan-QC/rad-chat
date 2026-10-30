import { useCallback } from 'react';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { AppConfig } from '../../config/AppConfig';
import { formatDateTime } from '../../core/format';
import { useAsync } from '../../hooks/useAsync';
import type { AdminUser } from '../../services/AdminService';
import { Avatar } from '../Avatar';

function statusOf(user: AdminUser, online: boolean): { label: string; className: string } {
  if (user.deactivated_at) return { label: 'Deactivated', className: 'off' };
  if (user.expires_at && new Date(user.expires_at) < new Date()) return { label: 'Expired', className: 'off' };
  return online ? { label: 'Online', className: 'on' } : { label: 'Offline', className: '' };
}

/** De link naar de gebruikerslijst van dit project in het Supabase-dashboard, afgeleid van de Supabase-URL. */
function dashboardUsersUrl(): string | null {
  try {
    const ref = new URL(AppConfig.load().supabaseUrl).hostname.split('.')[0];
    return ref ? `https://supabase.com/dashboard/project/${ref}/auth/users` : null;
  } catch {
    return null;
  }
}

/** Ledenlijst voor beheerders, alleen lezen: accounts maak, wijzig, deactiveer en verwijder je uitsluitend in Supabase. */
export function UsersTab() {
  const { admin } = useServices();
  const { profileById, onlineIds } = useWorkspace();
  const load = useCallback(() => admin.listUsers(), [admin]);
  const { data, loading, error, reload } = useAsync(load);
  const dashboard = dashboardUsersUrl();

  return (
    <>
      <div className="toolbar">
        {dashboard && <a className="btn small" href={dashboard} target="_blank" rel="noopener noreferrer">Manage accounts in Supabase</a>}
        <button className="btn secondary small" onClick={() => void reload()}>Refresh</button>
      </div>
      <p className="muted">
        This list is read only. Accounts are created, changed, deactivated and deleted in Supabase (Authentication → Users and the profiles table).
        Everyone changes their own password under Settings → My account.
      </p>
      {error && <div className="banner error">{error}. The admin API needs to be running with the Supabase service key.</div>}
      {loading ? <p className="muted">Loading…</p> : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Colleague</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th></tr></thead>
            <tbody>
              {data?.map(user => {
                const profile = profileById(user.id);
                const status = statusOf(user, onlineIds.has(user.id));
                return (
                  <tr key={user.id}>
                    <td>
                      <span className="who-cell">
                        <Avatar name={user.display_name ?? user.email ?? '?'} color={profile?.avatar_color ?? '#4a4a4a'} size="sm" />
                        <span>{user.display_name ?? '—'}<small className="muted block">@{user.username ?? 'unknown'}</small></span>
                      </span>
                    </td>
                    <td>{user.email}</td>
                    <td><span className={`badge role-${user.role}`}>{user.role}</span>{user.role === 'guest' && user.expires_at && <small className="muted block">until {formatDateTime(user.expires_at)}</small>}</td>
                    <td><span className={`status-pill ${status.className}`}>{status.label}</span></td>
                    <td className="nowrap">{user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : 'never'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
