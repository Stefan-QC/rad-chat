import { useState, type FormEvent } from 'react';
import { messageOf } from '../../core/AppError';
import type { Role } from '../../core/types';
import { generatePassword, type AdminUser } from '../../services/AdminService';
import { useServices } from '../../app/ServicesContext';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

const toIso = (local: string): string | null => (local ? new Date(local).toISOString() : null);
const tomorrowLocal = (): string => {
  const date = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

interface DialogProps {
  onClose: () => void;
  onDone: () => void;
}

function RoleFields({ role, onRole, expires, onExpires }: { role: Role; onRole: (role: Role) => void; expires: string; onExpires: (value: string) => void }) {
  return (
    <>
      <label>Role
        <select className="text-input" value={role} onChange={event => onRole(event.target.value as Role)}>
          <option value="member">Member: full access to company channels</option>
          <option value="guest">Guest: only channels they are invited to, expires</option>
          <option value="admin">Admin: can manage users and see the audit log</option>
        </select>
      </label>
      {role === 'guest' && (
        <label>Access ends on
          <input className="text-input" type="datetime-local" required value={expires} min={new Date().toISOString().slice(0, 16)} onChange={event => onExpires(event.target.value)} />
        </label>
      )}
    </>
  );
}

/** Maakt een account aan met een wachtwoord, of stuurt een uitnodiging per e-mail. */
export function CreateUserDialog({ onClose, onDone }: DialogProps) {
  const { admin } = useServices();
  const toast = useToast();
  const [mode, setMode] = useState<'create' | 'invite'>('create');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [role, setRole] = useState<Role>('member');
  const [expires, setExpires] = useState(tomorrowLocal());
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === 'invite') {
        await admin.inviteUser(email.trim(), role);
        toast.success(`Invitation sent to ${email.trim()}.`);
        onDone();
        onClose();
      } else {
        await admin.createUser({ email: email.trim(), password, display_name: name.trim() || undefined, role, expires_at: role === 'guest' ? toIso(expires) : null });
        setCreated({ email: email.trim(), password });
        onDone();
      }
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Modal title="Account created" onClose={onClose} width={480}>
        <p>Share these sign-in details with <b>{created.email}</b>. The password is not shown again.</p>
        <div className="credentials">
          <span>Email</span><code>{created.email}</code>
          <span>Password</span><code>{created.password}</code>
        </div>
        <div className="actions">
          <button className="btn secondary" onClick={() => void navigator.clipboard?.writeText(`${created.email}\n${created.password}`).then(() => toast.success('Copied.'))}>Copy</button>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add a user" onClose={onClose} width={520}>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'create'} className={mode === 'create' ? 'on' : ''} onClick={() => setMode('create')}>Create with password</button>
        <button role="tab" aria-selected={mode === 'invite'} className={mode === 'invite' ? 'on' : ''} onClick={() => setMode('invite')}>Invite by email</button>
      </div>
      <form className="form dialog-form" onSubmit={submit}>
        <label>Email
          <input className="text-input" type="email" required autoFocus value={email} onChange={event => setEmail(event.target.value)} />
        </label>
        {mode === 'create' && (
          <>
            <label>Display name (optional)
              <input className="text-input" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
            </label>
            <label>Temporary password
              <span className="password-row">
                <input className="text-input" value={password} minLength={10} required onChange={event => setPassword(event.target.value)} />
                <button type="button" className="btn secondary small" onClick={() => setPassword(generatePassword())}>Generate</button>
              </span>
            </label>
          </>
        )}
        <RoleFields role={role} onRole={setRole} expires={expires} onExpires={setExpires} />
        {mode === 'invite' && <p className="muted">The invitation is an email from Supabase; make sure email sending is set up in your Supabase project.</p>}
        <div className="actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{mode === 'invite' ? 'Send invitation' : 'Create account'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ResetPasswordDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { admin } = useServices();
  const toast = useToast();
  const [password, setPassword] = useState(() => generatePassword());
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await admin.setPassword(user.id, password);
      toast.success(`Password changed for ${user.display_name ?? user.email}.`);
      onClose();
    } catch (error) {
      toast.error(messageOf(error));
      setBusy(false);
    }
  };

  return (
    <Modal title="Reset password" onClose={onClose} width={460}>
      <form className="form dialog-form" onSubmit={submit}>
        <p>Set a new password for <b>{user.display_name ?? user.email}</b> and share it with them.</p>
        <label>New password
          <span className="password-row">
            <input className="text-input" value={password} minLength={10} required onChange={event => setPassword(event.target.value)} />
            <button type="button" className="btn secondary small" onClick={() => setPassword(generatePassword())}>Generate</button>
          </span>
        </label>
        <div className="actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>Change password</button>
        </div>
      </form>
    </Modal>
  );
}

export function ChangeRoleDialog({ user, onClose, onDone }: DialogProps & { user: AdminUser }) {
  const { admin } = useServices();
  const toast = useToast();
  const [role, setRole] = useState<Role>(user.role);
  const [expires, setExpires] = useState(user.expires_at ? user.expires_at.slice(0, 16) : tomorrowLocal());
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await admin.setRole(user.id, role, role === 'guest' ? toIso(expires) : null);
      toast.success('Role updated.');
      onDone();
      onClose();
    } catch (error) {
      toast.error(messageOf(error));
      setBusy(false);
    }
  };

  return (
    <Modal title="Change role" onClose={onClose} width={480}>
      <form className="form dialog-form" onSubmit={submit}>
        <RoleFields role={role} onRole={setRole} expires={expires} onExpires={setExpires} />
        <div className="actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
