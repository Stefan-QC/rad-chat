import { useCallback, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { messageOf } from '../../core/AppError';
import { formatDateTime } from '../../core/format';
import { useAsync } from '../../hooks/useAsync';
import type { AdminUser } from '../../services/AdminService';
import { Avatar } from '../Avatar';
import { useToast } from '../ui/Toast';
import { ChangeRoleDialog, CreateUserDialog, ResetPasswordDialog } from './UserDialogs';

type Dialog = { kind: 'create' } | { kind: 'password'; user: AdminUser } | { kind: 'role'; user: AdminUser };

function statusOf(user: AdminUser, online: boolean): { label: string; className: string } {
  if (user.deactivated_at) return { label: 'Deactivated', className: 'off' };
  if (user.expires_at && new Date(user.expires_at) < new Date()) return { label: 'Expired', className: 'off' };
  return online ? { label: 'Online', className: 'on' } : { label: 'Offline', className: '' };
}

/** Gebruikersbeheer: aanmaken, uitnodigen, rol of wachtwoord wijzigen en accounts uitzetten. */
export function UsersTab() {
  const { admin } = useServices();
  const { me } = useAuth();
  const { profileById, onlineIds } = useWorkspace();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const load = useCallback(() => admin.listUsers(), [admin]);
  const { data, loading, error, reload } = useAsync(load);

  const toggleActive = async (user: AdminUser) => {
    const name = user.display_name ?? user.email ?? 'this user';
    if (!window.confirm(user.deactivated_at ? `Reactivate ${name}?` : `Deactivate ${name}? They are signed out and can no longer use RAD Chat.`)) return;
    try {
      if (user.deactivated_at) await admin.reactivate(user.id);
      else await admin.deactivate(user.id);
      toast.success(user.deactivated_at ? 'Account reactivated.' : 'Account deactivated.');
      await reload();
    } catch (e) {
      toast.error(messageOf(e));
    }
  };

  return (
    <>
      <div className="toolbar">
        <button className="btn small" onClick={() => setDialog({ kind: 'create' })}>Add user</button>
        <button className="btn secondary small" onClick={() => void reload()}>Refresh</button>
      </div>
      {error && <div className="banner error">{error}. The admin API needs to be running with the Supabase service key.</div>}
      {loading ? <p className="muted">Loading…</p> : (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Colleague</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {data?.map(user => {
                const profile = profileById(user.id);
                const status = statusOf(user, onlineIds.has(user.id));
                const self = user.id === me?.id;
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
                    <td className="row-actions">
                      <button className="btn secondary small" disabled={self} onClick={() => setDialog({ kind: 'role', user })}>Role</button>
                      <button className="btn secondary small" onClick={() => setDialog({ kind: 'password', user })}>Password</button>
                      <button className={`btn small ${user.deactivated_at ? 'secondary' : 'danger'}`} disabled={self} onClick={() => void toggleActive(user)}>
                        {user.deactivated_at ? 'Reactivate' : 'Deactivate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {dialog?.kind === 'create' && <CreateUserDialog onClose={() => setDialog(null)} onDone={() => void reload()} />}
      {dialog?.kind === 'password' && <ResetPasswordDialog user={dialog.user} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'role' && <ChangeRoleDialog user={dialog.user} onClose={() => setDialog(null)} onDone={() => void reload()} />}
    </>
  );
}
