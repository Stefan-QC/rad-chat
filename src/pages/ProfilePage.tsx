import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { useWorkspace } from '../app/WorkspaceContext';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { messageOf } from '../core/AppError';
import type { Profile } from '../core/types';
import { useAsync } from '../hooks/useAsync';

const COLORS = ['#D71920', '#822727', '#1b1b1b', '#E53E3E', '#63171B', '#4a4a4a', '#9B2C2C', '#F56565', '#2b6cb0', '#2f855a', '#b7791f', '#6b46c1'];

function ProfileStats({ userId }: { userId: string }) {
  const { leaderboard } = useServices();
  const { teams } = useWorkspace();
  const load = useCallback(() => leaderboard.users(500), [leaderboard]);
  const { data } = useAsync(load);
  const score = data?.find(entry => entry.user_id === userId);
  const memberOf = teams.filter(team => team.members.some(m => m.user_id === userId));
  return (
    <div className="stat-row">
      <div><b>{score?.points ?? 0}</b><span>Total points</span></div>
      <div><b>{score?.wordle_points ?? 0}</b><span>Wordle</span></div>
      <div><b>{score?.craft_points ?? 0}</b><span>Craft</span></div>
      <div><b>{memberOf.length}</b><span>Teams</span></div>
    </div>
  );
}

function ReadOnlyProfile({ profile }: { profile: Profile }) {
  const { teams, onlineIds } = useWorkspace();
  const memberOf = teams.filter(team => team.members.some(m => m.user_id === profile.id));
  return (
    <div className="card profile-card">
      <div className="profile-top">
        <Avatar name={profile.display_name} color={profile.avatar_color} size="lg" online={onlineIds.has(profile.id)} />
        <div>
          <h2>{profile.display_name}</h2>
          <p className="muted">@{profile.username}{profile.job_title ? ` · ${profile.job_title}` : ''}</p>
          {profile.role === 'admin' && <span className="badge">admin</span>}
        </div>
      </div>
      {profile.bio && <p>{profile.bio}</p>}
      <ProfileStats userId={profile.id} />
      {memberOf.length > 0 && (
        <p className="chips">{memberOf.map(team => <span key={team.id} className="chip" style={{ borderColor: team.color }}>{team.name}</span>)}</p>
      )}
    </div>
  );
}

function EditProfile({ profile }: { profile: Profile }) {
  const { profiles } = useServices();
  const { session, reloadMe, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [jobTitle, setJobTitle] = useState(profile.job_title ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [color, setColor] = useState(profile.avatar_color);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await profiles.updateMine(profile.id, { display_name: displayName, job_title: jobTitle, bio, avatar_color: color });
      await reloadMe();
      setNotice({ kind: 'ok', text: 'Profile saved.' });
    } catch (e) {
      setNotice({ kind: 'error', text: messageOf(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <form className="card form" onSubmit={save}>
        <div className="profile-top">
          <Avatar name={displayName || '?'} color={color} size="lg" />
          <div>
            <h2>Your profile</h2>
            <p className="muted">@{profile.username} · {session?.user.email}</p>
            {profile.role === 'admin' && <span className="badge">admin</span>}
          </div>
        </div>
        <label>Display name
          <input className="text-input" value={displayName} maxLength={40} required onChange={e => setDisplayName(e.target.value)} />
        </label>
        <label>Job title
          <input className="text-input" value={jobTitle} maxLength={60} placeholder="e.g. Software engineer" onChange={e => setJobTitle(e.target.value)} />
        </label>
        <label>About you
          <textarea className="text-input" value={bio} maxLength={280} rows={3} placeholder="A short bio for your colleagues" onChange={e => setBio(e.target.value)} />
        </label>
        <div>
          <span className="label">Avatar colour</span>
          <div className="swatches">
            {COLORS.map(c => (
              <button type="button" key={c} className={`swatch${c.toLowerCase() === color.toLowerCase() ? ' on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        {notice && <div className={`banner ${notice.kind}`} role="status">{notice.text}</div>}
        <div className="actions"><button className="btn" disabled={saving || !displayName.trim()}>{saving ? 'Saving…' : 'Save changes'}</button></div>
      </form>
      <PasswordForm />
      <div className="card"><h3>Statistics</h3><ProfileStats userId={profile.id} /></div>
      <div className="card"><button className="btn secondary" onClick={() => void signOut()}>Sign out</button></div>
    </>
  );
}

function PasswordForm() {
  const { auth } = useServices();
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await auth.changePassword(password);
      setPassword('');
      setNotice({ kind: 'ok', text: 'Password changed.' });
    } catch (e) {
      setNotice({ kind: 'error', text: messageOf(e) });
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h3>Change password</h3>
      <label>New password
        <input className="text-input" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} />
      </label>
      {notice && <div className={`banner ${notice.kind}`} role="status">{notice.text}</div>}
      <div className="actions"><button className="btn secondary" disabled={password.length < 8}>Update password</button></div>
    </form>
  );
}

/** /profile bewerkt het eigen profiel; /profile/:id toont het profiel van een collega. */
export function ProfilePage() {
  const { userId } = useParams();
  const { me } = useAuth();
  const { profileById, profiles } = useWorkspace();
  const navigate = useNavigate();
  const targetId = userId ?? me?.id;
  const profile = profileById(targetId);

  useEffect(() => {
    if (userId && userId === me?.id) navigate('/profile', { replace: true });
  }, [userId, me?.id, navigate]);

  return (
    <>
      <PageHeader title={userId ? 'Profile' : 'Your profile'} />
      <div className="page">
        {profile ? (userId && userId !== me?.id ? <ReadOnlyProfile profile={profile} /> : <EditProfile key={profile.id} profile={profile} />)
          : <p className="muted">{profiles.length === 0 ? 'Loading…' : 'This user does not exist.'}</p>}
      </div>
    </>
  );
}
