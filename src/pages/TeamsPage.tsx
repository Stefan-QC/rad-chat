import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { useWorkspace } from '../app/WorkspaceContext';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { messageOf } from '../core/AppError';
import type { TeamWithMembers } from '../core/types';
import type { TeamDraft } from '../services/TeamService';

const COLORS = ['#D71920', '#822727', '#1b1b1b', '#2b6cb0', '#2f855a', '#b7791f', '#6b46c1'];

function TeamForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: TeamDraft;
  submitLabel: string;
  onSubmit: (draft: TeamDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onSubmit(draft);
    } catch (e) {
      setError(messageOf(e));
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <label>Team name
        <input className="text-input" value={draft.name} minLength={2} maxLength={40} required autoFocus onChange={e => setDraft({ ...draft, name: e.target.value })} />
      </label>
      <label>Description
        <textarea className="text-input" rows={2} maxLength={280} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
      </label>
      <div>
        <span className="label">Colour</span>
        <div className="swatches">
          {COLORS.map(c => <button type="button" key={c} className={`swatch${c === draft.color ? ' on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => setDraft({ ...draft, color: c })} />)}
        </div>
      </div>
      {error && <div className="banner error" role="alert">{error}</div>}
      <div className="actions">
        <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
        <button className="btn">{submitLabel}</button>
      </div>
    </form>
  );
}

function TeamDetail({ team }: { team: TeamWithMembers }) {
  const { teams: service } = useServices();
  const { me } = useAuth();
  const { profileById, channels, onlineIds, refreshTeams } = useWorkspace();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = team.members.find(m => m.user_id === me?.id);
  const canManage = mine?.role === 'owner' || me?.role === 'admin';
  const textChannel = channels.find(c => c.team_id === team.id && c.kind === 'text');

  const run = async (action: () => Promise<void>, after?: () => void) => {
    try {
      setError(null);
      await action();
      await refreshTeams();
      after?.();
    } catch (e) {
      setError(messageOf(e));
    }
  };

  if (editing) {
    return (
      <TeamForm
        initial={{ name: team.name, description: team.description ?? '', color: team.color }}
        submitLabel="Save"
        onCancel={() => setEditing(false)}
        onSubmit={async draft => { await service.update(team.id, draft); await refreshTeams(); setEditing(false); }}
      />
    );
  }

  return (
    <div className="card">
      <div className="team-head">
        <span className="team-dot" style={{ background: team.color }} />
        <h2>{team.name}</h2>
      </div>
      <p className="muted">{team.description || 'No description yet.'}</p>
      <div className="actions left">
        {!mine && <button className="btn" onClick={() => void run(() => service.join(team.id))}>Join team</button>}
        {mine && textChannel && <button className="btn" onClick={() => navigate(`/channels/${textChannel.id}`)}>Open team chat</button>}
        {mine && <button className="btn secondary" onClick={() => window.confirm(`Leave ${team.name}?`) && void run(() => service.leave(team.id), () => navigate('/teams'))}>Leave team</button>}
        {canManage && <button className="btn secondary" onClick={() => setEditing(true)}>Edit</button>}
        {canManage && <button className="btn danger" onClick={() => window.confirm(`Delete ${team.name} and its channels?`) && void run(() => service.remove(team.id), () => navigate('/teams'))}>Delete</button>}
      </div>
      {error && <div className="banner error" role="alert">{error}</div>}
      <h3>Members — {team.members.length}</h3>
      <ul className="member-list">
        {team.members.map(member => {
          const profile = profileById(member.user_id);
          if (!profile) return null;
          return (
            <li key={member.user_id}>
              <Avatar name={profile.display_name} color={profile.avatar_color} size="sm" online={onlineIds.has(profile.id)} />
              <button className="link" onClick={() => navigate(`/profile/${profile.id}`)}>{profile.display_name}</button>
              {member.role === 'owner' && <span className="badge">owner</span>}
              {canManage && member.user_id !== me?.id && (
                <button className="btn secondary small" onClick={() => void run(() => service.removeMember(team.id, member.user_id))}>Remove</button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Overzicht van alle teams met aanmaken, deelnemen en beheren. */
export function TeamsPage() {
  const { teamId } = useParams();
  const { teams: service } = useServices();
  const { me } = useAuth();
  const { teams, refreshTeams } = useWorkspace();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const selected = teams.find(t => t.id === teamId);

  return (
    <>
      <PageHeader title="Teams" actions={<button className="btn small" onClick={() => { setCreating(true); navigate('/teams'); }}>New team</button>} />
      <div className="page two-col">
        <div className="col list">
          {teams.length === 0 && <p className="muted">There are no teams yet. Create the first one.</p>}
          {teams.map(team => (
            <button key={team.id} className={`team-card${team.id === teamId ? ' on' : ''}`} onClick={() => { setCreating(false); navigate(`/teams/${team.id}`); }}>
              <span className="team-dot" style={{ background: team.color }} />
              <span className="grow"><b>{team.name}</b><small>{team.members.length} member{team.members.length === 1 ? '' : 's'}</small></span>
              {team.members.some(m => m.user_id === me?.id) && <span className="badge">joined</span>}
            </button>
          ))}
        </div>
        <div className="col detail">
          {creating ? (
            <TeamForm
              initial={{ name: '', description: '', color: COLORS[0] }}
              submitLabel="Create team"
              onCancel={() => setCreating(false)}
              onSubmit={async draft => {
                const id = await service.create(draft);
                await refreshTeams();
                setCreating(false);
                navigate(`/teams/${id}`);
              }}
            />
          ) : selected ? <TeamDetail key={selected.id} team={selected} /> : <p className="muted">Select a team to see its members.</p>}
        </div>
      </div>
    </>
  );
}
