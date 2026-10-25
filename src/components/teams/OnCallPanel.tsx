import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { messageOf } from '../../core/AppError';
import { formatDateTime } from '../../core/format';
import type { OnCallShift, TeamWithMembers } from '../../core/types';
import { Avatar } from '../Avatar';
import { useToast } from '../ui/Toast';

const localInput = (date: Date): string => {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 16);
};

/** Het bereikbaarheidsrooster van een team; teameigenaren en moderators kunnen diensten plannen. */
export function OnCallPanel({ team }: { team: TeamWithMembers }) {
  const { people } = useServices();
  const { me } = useAuth();
  const { profileById } = useWorkspace();
  const toast = useToast();
  const [shifts, setShifts] = useState<OnCallShift[]>([]);
  const [userId, setUserId] = useState(team.members[0]?.user_id ?? '');
  const [start, setStart] = useState(localInput(new Date()));
  const [end, setEnd] = useState(localInput(new Date(Date.now() + 7 * 86_400_000)));
  const [note, setNote] = useState('');
  const mine = team.members.find(m => m.user_id === me?.id);
  const canEdit = me?.role === 'admin' || mine?.role === 'owner' || mine?.role === 'moderator';

  const load = useCallback(() => {
    people.listOnCall(team.id).then(setShifts).catch(() => undefined);
  }, [people, team.id]);
  useEffect(load, [load]);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await people.addOnCall(team.id, userId, new Date(start).toISOString(), new Date(end).toISOString(), note);
      setNote('');
      load();
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  const remove = async (shift: OnCallShift) => {
    try {
      await people.removeOnCall(shift.id);
      load();
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  const now = Date.now();
  return (
    <section className="oncall">
      <h3>On call</h3>
      {shifts.length === 0 && <p className="muted">No upcoming shifts planned.</p>}
      <ul className="member-list roomy">
        {shifts.map(shift => {
          const person = profileById(shift.user_id);
          const active = new Date(shift.starts_at).getTime() <= now && new Date(shift.ends_at).getTime() > now;
          return (
            <li key={shift.id} className={active ? 'oncall-now' : ''}>
              {person && <Avatar name={person.display_name} color={person.avatar_color} size="sm" />}
              <span className="grow"><b>{person?.display_name ?? 'Unknown'}</b>{active && <span className="badge">on call now</span>}<small className="muted block">{formatDateTime(shift.starts_at)} → {formatDateTime(shift.ends_at)}{shift.note ? ` · ${shift.note}` : ''}</small></span>
              {canEdit && <button className="btn secondary small" onClick={() => void remove(shift)}>Remove</button>}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <form className="form oncall-form" onSubmit={add}>
          <label>Who
            <select className="text-input" value={userId} onChange={event => setUserId(event.target.value)}>
              {team.members.map(m => <option key={m.user_id} value={m.user_id}>{profileById(m.user_id)?.display_name ?? m.user_id}</option>)}
            </select>
          </label>
          <label>From<input className="text-input" type="datetime-local" required value={start} onChange={event => setStart(event.target.value)} /></label>
          <label>Until<input className="text-input" type="datetime-local" required value={end} onChange={event => setEnd(event.target.value)} /></label>
          <label>Note<input className="text-input" maxLength={200} value={note} placeholder="Optional" onChange={event => setNote(event.target.value)} /></label>
          <button className="btn small">Add shift</button>
        </form>
      )}
    </section>
  );
}
