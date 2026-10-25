import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { Icon } from '../components/Icon';
import { messageOf } from '../core/AppError';

/** Inlogscherm: accounts worden door een beheerder in Supabase aangemaakt. */
export function LoginPage() {
  const { auth } = useServices();
  const { status } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'signedIn') return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.signIn(email, password);
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  };

  return (
    <div id="join">
      <span className="circle" /><span className="arc a" /><span className="arc b" />
      <span className="pill a" /><span className="pill b" />
      <form id="joinCard" onSubmit={submit}>
        <Icon name="logo" className="logo" />
        <h1>RAD Chat</h1>
        <p>Sign in with your work account.</p>
        <label htmlFor="email">Email</label>
        <input id="email" className="text-input" type="email" autoComplete="username" autoFocus required value={email} onChange={e => setEmail(e.target.value)} />
        <label htmlFor="password">Password</label>
        <input id="password" className="text-input" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        {error && <div className="banner error" role="alert">{error}</div>}
        <button className="btn" disabled={busy || status === 'loading'}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <small>Accounts are created by an administrator · Quality in Information Technology</small>
      </form>
    </div>
  );
}
