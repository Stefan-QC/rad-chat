import { useState, type FormEvent } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { messageOf } from '../../core/AppError';
import type { MeetingNote } from '../../core/types';
import { PeoplePicker } from '../chat/PeoplePicker';
import { MarkdownEditor } from '../MarkdownEditor';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

const toLocalInput = (iso: string): string => {
  const date = new Date(iso);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

interface MeetingEditorProps {
  meeting?: MeetingNote;
  onClose: () => void;
  onSaved: (id: number) => void;
}

/** Editor voor vergadernotities met datum, deelnemers en een opgemaakt verslag. */
export function MeetingEditor({ meeting, onClose, onSaved }: MeetingEditorProps) {
  const { meetings } = useServices();
  const { me } = useAuth();
  const { profiles, myTeams } = useWorkspace();
  const toast = useToast();
  const [title, setTitle] = useState(meeting?.title ?? '');
  const [teamId, setTeamId] = useState(meeting ? meeting.team_id ?? '' : '');
  const [heldAt, setHeldAt] = useState(toLocalInput(meeting?.held_at ?? new Date().toISOString()));
  const [attendees, setAttendees] = useState<string[]>(meeting?.attendees ?? (me ? [me.id] : []));
  const [notes, setNotes] = useState(meeting?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const team = myTeams.find(t => t.id === teamId);
  const candidates = profiles.filter(p => !p.deactivated_at && p.role !== 'guest' && (!team || team.members.some(m => m.user_id === p.id)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const id = await meetings.save({ id: meeting?.id, teamId: teamId || null, title: title.trim(), heldAt: new Date(heldAt).toISOString(), attendees, notes });
      onSaved(id);
      onClose();
    } catch (error) {
      toast.error(messageOf(error));
      setBusy(false);
    }
  };

  return (
    <Modal title={meeting ? 'Edit meeting' : 'New meeting'} onClose={onClose} width={760}>
      <form className="form dialog-form" onSubmit={submit}>
        <label>Title
          <input className="text-input" autoFocus required maxLength={150} value={title} placeholder="Sprint planning" onChange={event => setTitle(event.target.value)} />
        </label>
        <div className="two-fields">
          <label>Who can read it
            <select className="text-input" value={teamId} disabled={Boolean(meeting)} onChange={event => { setTeamId(event.target.value); setAttendees(me ? [me.id] : []); }}>
              <option value="">Everyone at the company</option>
              {myTeams.map(t => <option key={t.id} value={t.id}>Team: {t.name}</option>)}
            </select>
          </label>
          <label>When
            <input className="text-input" type="datetime-local" required value={heldAt} onChange={event => setHeldAt(event.target.value)} />
          </label>
        </div>
        <div className="dialog-section">
          <span className="label">Attendees</span>
          <PeoplePicker people={candidates} selected={attendees} onChange={setAttendees} placeholder="Search attendees…" />
        </div>
        <MarkdownEditor value={notes} onChange={setNotes} rows={10} placeholder="Agenda, discussion, next steps…" />
        <div className="actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !title.trim()}>Save meeting</button>
        </div>
      </form>
    </Modal>
  );
}
