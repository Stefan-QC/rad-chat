import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { useWorkspace } from '../app/WorkspaceContext';
import { Avatar } from '../components/Avatar';
import { Markdown } from '../components/Markdown';
import { MeetingEditor } from '../components/meetings/MeetingEditor';
import { PageHeader } from '../components/PageHeader';
import { TaskDialog } from '../components/tasks/TaskDialog';
import { useToast } from '../components/ui/Toast';
import { messageOf } from '../core/AppError';
import { formatDateTime } from '../core/format';
import type { Decision, MeetingNote } from '../core/types';
import { useTasks } from '../hooks/useTasks';

type Tab = 'meetings' | 'decisions';

/** Vergadernotities en besluiten: een lijst met verslagen, besluiten per vergadering en actiepunten als taken. */
export function MeetingsPage() {
  const { meetings: service } = useServices();
  const { me } = useAuth();
  const { teams, profileById } = useWorkspace();
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { tasks, reload: reloadTasks } = useTasks();
  const [meetings, setMeetings] = useState<MeetingNote[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [tab, setTab] = useState<Tab>('meetings');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ meeting?: MeetingNote } | null>(null);
  const [actionFor, setActionFor] = useState<MeetingNote | null>(null);
  const [decisionText, setDecisionText] = useState('');

  const reload = useCallback(() => {
    service.listMeetings().then(setMeetings).catch(() => undefined);
    service.listDecisions().then(setDecisions).catch(() => undefined);
  }, [service]);
  useEffect(() => {
    reload();
    return service.watch(reload);
  }, [service, reload]);

  const selected = meetings.find(m => String(m.id) === meetingId);
  const scopeName = (teamId: string | null) => (teamId ? teams.find(t => t.id === teamId)?.name ?? 'Team' : 'Company');
  const canManage = (m: MeetingNote) => m.created_by === me?.id || me?.role === 'admin' || ['owner', 'moderator'].includes(teams.find(t => t.id === m.team_id)?.members.find(x => x.user_id === me?.id)?.role ?? '');

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return meetings.filter(m => !text || m.title.toLowerCase().includes(text) || m.notes.toLowerCase().includes(text));
  }, [meetings, query]);
  const filteredDecisions = useMemo(() => {
    const text = query.trim().toLowerCase();
    return decisions.filter(d => !text || d.text.toLowerCase().includes(text));
  }, [decisions, query]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      reload();
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  const addDecision = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !decisionText.trim()) return;
    void run(() => service.addDecision(selected.id, decisionText.trim()));
    setDecisionText('');
  };

  const actions = selected ? tasks.filter(t => t.meeting_id === selected.id) : [];

  return (
    <>
      <PageHeader title="Meetings and decisions" actions={<button className="btn small" onClick={() => setEditing({})}>New meeting</button>} />
      <div className="page wide two-col meetings">
        <div className="col list">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'meetings'} className={tab === 'meetings' ? 'on' : ''} onClick={() => setTab('meetings')}>Meetings</button>
            <button role="tab" aria-selected={tab === 'decisions'} className={tab === 'decisions' ? 'on' : ''} onClick={() => setTab('decisions')}>Decisions ({decisions.length})</button>
          </div>
          <input className="text-input" type="search" value={query} placeholder={tab === 'meetings' ? 'Search meetings…' : 'Search decisions…'} aria-label="Search" onChange={event => setQuery(event.target.value)} />
          {tab === 'meetings' ? (
            <>
              {filtered.length === 0 && <div className="empty-state"><b>No meetings yet.</b><span>Capture notes and decisions so nothing gets lost.</span></div>}
              {filtered.map(m => (
                <button key={m.id} className={`team-card${String(m.id) === meetingId ? ' on' : ''}`} onClick={() => navigate(`/meetings/${m.id}`)}>
                  <span className="grow"><b>{m.title}</b><small>{formatDateTime(m.held_at)} · {scopeName(m.team_id)}</small></span>
                </button>
              ))}
            </>
          ) : (
            <ul className="decision-list">
              {filteredDecisions.length === 0 && <li className="muted">No decisions found.</li>}
              {filteredDecisions.map(d => (
                <li key={d.id}>
                  <b>{d.text}</b>
                  <small className="muted">{new Date(`${d.decided_on}T12:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} · {scopeName(d.team_id)} · <button className="link" onClick={() => { setTab('meetings'); navigate(`/meetings/${d.meeting_id}`); }}>{meetings.find(m => m.id === d.meeting_id)?.title ?? 'meeting'}</button></small>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="col detail">
          {!selected && <p className="muted">Select a meeting to read the notes.</p>}
          {selected && (
            <article className="card meeting">
              <header>
                <div>
                  <h2>{selected.title}</h2>
                  <p className="muted">{formatDateTime(selected.held_at)} · {scopeName(selected.team_id)} · written by {profileById(selected.created_by)?.display_name ?? 'someone'}</p>
                </div>
                {canManage(selected) && (
                  <div className="row-actions">
                    <button className="btn secondary small" onClick={() => setEditing({ meeting: selected })}>Edit</button>
                    <button className="btn secondary small" onClick={() => window.confirm('Delete this meeting with its decisions?') && void run(async () => { await service.remove(selected.id); navigate('/meetings'); })}>Delete</button>
                  </div>
                )}
              </header>
              {selected.attendees.length > 0 && (
                <div className="attendees">
                  {selected.attendees.map(id => {
                    const person = profileById(id);
                    return person && <span key={id} className="attendee"><Avatar name={person.display_name} color={person.avatar_color} size="xs" />{person.display_name}</span>;
                  })}
                </div>
              )}
              {selected.notes ? <Markdown source={selected.notes} /> : <p className="muted">No notes written.</p>}

              <h3>Decisions</h3>
              <ul className="decision-list">
                {decisions.filter(d => d.meeting_id === selected.id).map(d => (
                  <li key={d.id}>
                    <b>{d.text}</b>
                    {(d.created_by === me?.id || canManage(selected)) && <button className="btn secondary small" onClick={() => void run(() => service.removeDecision(d.id))}>Remove</button>}
                  </li>
                ))}
              </ul>
              <form className="inline-form" onSubmit={addDecision}>
                <input className="text-input" value={decisionText} maxLength={500} placeholder="We decided to…" aria-label="New decision" onChange={event => setDecisionText(event.target.value)} />
                <button className="btn small" disabled={!decisionText.trim()}>Add decision</button>
              </form>

              <h3>Action items</h3>
              <ul className="decision-list">
                {actions.length === 0 && <li className="muted">No action items yet.</li>}
                {actions.map(t => (
                  <li key={t.id}><span className={t.status === 'done' ? 'struck' : ''}>{t.title}</span><small className="muted">{profileById(t.assignee_id)?.display_name ?? 'Unassigned'}{t.due_date ? ` · due ${t.due_date}` : ''}</small></li>
                ))}
              </ul>
              <button className="btn secondary small" onClick={() => setActionFor(selected)}>Add action item</button>
            </article>
          )}
        </div>
      </div>
      {editing && <MeetingEditor meeting={editing.meeting} onClose={() => setEditing(null)} onSaved={id => { reload(); navigate(`/meetings/${id}`); }} />}
      {actionFor && <TaskDialog seed={{ meetingId: actionFor.id, teamId: actionFor.team_id }} onClose={() => setActionFor(null)} onDone={reloadTasks} />}
    </>
  );
}
