import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { messageOf } from '../../core/AppError';
import type { Task } from '../../core/types';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface TaskDialogProps {
  task?: Task;
  /** Voorinvulling bij het maken van een taak uit een bericht of vergadering. */
  seed?: { title?: string; description?: string; messageId?: number; meetingId?: number; teamId?: string | null };
  onClose: () => void;
  onDone: () => void;
}

/** Dialoog om een taak te maken of te wijzigen, met verantwoordelijke, einddatum en optioneel een team. */
export function TaskDialog({ task, seed, onClose, onDone }: TaskDialogProps) {
  const { tasks: service } = useServices();
  const { me } = useAuth();
  const { profiles, myTeams } = useWorkspace();
  const toast = useToast();
  const [title, setTitle] = useState(task?.title ?? seed?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? seed?.description ?? '');
  const [teamId, setTeamId] = useState(task?.team_id ?? seed?.teamId ?? '');
  const [assignee, setAssignee] = useState(task?.assignee_id ?? me?.id ?? '');
  const [due, setDue] = useState(task?.due_date ?? '');
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => {
    const team = myTeams.find(t => t.id === teamId);
    return profiles.filter(p => !p.deactivated_at && p.role !== 'guest' && (!team || team.members.some(m => m.user_id === p.id)));
  }, [profiles, myTeams, teamId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const draft = { title: title.trim(), description: description.trim(), assigneeId: assignee || null, dueDate: due || null, teamId: teamId || null, messageId: seed?.messageId, meetingId: seed?.meetingId };
      if (task) await service.update(task.id, draft);
      else await service.create(draft);
      onDone();
      onClose();
    } catch (error) {
      toast.error(messageOf(error));
      setBusy(false);
    }
  };

  return (
    <Modal title={task ? 'Edit task' : 'New task'} onClose={onClose} width={520}>
      <form className="form dialog-form" onSubmit={submit}>
        <label>Title
          <input className="text-input" autoFocus required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} />
        </label>
        <label>Details (optional)
          <textarea className="text-input" rows={3} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} />
        </label>
        {!task && myTeams.length > 0 && (
          <label>Team (optional)
            <select className="text-input" value={teamId} onChange={event => { setTeamId(event.target.value); setAssignee(me?.id ?? ''); }}>
              <option value="">Personal or company wide</option>
              {myTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
        )}
        <div className="two-fields">
          <label>Assigned to
            <select className="text-input" value={assignee} onChange={event => setAssignee(event.target.value)}>
              <option value="">Nobody yet</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.display_name}{p.id === me?.id ? ' (you)' : ''}</option>)}
            </select>
          </label>
          <label>Due date
            <input className="text-input" type="date" value={due} onChange={event => setDue(event.target.value)} />
          </label>
        </div>
        <div className="actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !title.trim()}>{task ? 'Save' : 'Create task'}</button>
        </div>
      </form>
    </Modal>
  );
}
