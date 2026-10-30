import { useState, type FormEvent } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { messageOf } from '../../core/AppError';
import { MIN_PASSWORD_LENGTH, PasswordPolicy } from '../../core/PasswordPolicy';

/** Formulier om je eigen wachtwoord te wijzigen; je moet eerst je huidige wachtwoord opgeven. Niemand kan dat voor een ander doen. */
export function ChangePasswordForm() {
  const { auth } = useServices();
  const { session } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const problem = PasswordPolicy.check(current, next, confirm);
  const touched = next.length > 0 || confirm.length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const email = session?.user.email;
    if (problem || !email) return;
    setBusy(true);
    setNotice(null);
    try {
      await auth.changePassword(email, current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setNotice({ kind: 'ok', text: 'Your password has been changed.' });
    } catch (error) {
      setNotice({ kind: 'error', text: messageOf(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form st-password" onSubmit={submit}>
      <label>Current password
        <input className="text-input" type="password" autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} />
      </label>
      <label>New password
        <input className="text-input" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} value={next} onChange={event => setNext(event.target.value)} />
      </label>
      <label>Confirm new password
        <input className="text-input" type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} />
      </label>
      {touched && problem && <p className="st-hint" role="status">{problem}</p>}
      {notice && <div className={`banner ${notice.kind}`} role="status">{notice.text}</div>}
      <div className="actions left"><button className="btn" disabled={busy || problem !== null}>{busy ? 'Saving…' : 'Change password'}</button></div>
    </form>
  );
}
