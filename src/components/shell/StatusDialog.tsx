import { useState, type FormEvent } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { messageOf } from '../../core/AppError';
import { STATUS_OPTIONS, StatusPresenter } from '../../core/presence';
import type { PresenceStatus } from '../../core/types';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

const DURATIONS: { label: string; minutes: number | 'today' | null }[] = [
  { label: 'Do not clear', minutes: null },
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: 'Today', minutes: 'today' },
];

const QUICK_EMOJI = ['📅', '🍽️', '🏠', '🌴', '🎧', '🤒'];

function untilFor(minutes: number | 'today' | null): string | null {
  if (minutes === null) return null;
  if (minutes === 'today') {
    const end = new Date();
    end.setHours(23, 59, 0, 0);
    return end.toISOString();
  }
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/** Dialoog om je status te kiezen, met een eigen tekst en een einde. */
export function StatusDialog({ onClose }: { onClose: () => void }) {
  const { people } = useServices();
  const { me, reloadMe } = useAuth();
  const toast = useToast();
  const current = me ? StatusPresenter.effective(me) : 'available';
  const [status, setStatus] = useState<PresenceStatus>(current);
  const [text, setText] = useState(me?.status_text ?? '');
  const [emoji, setEmoji] = useState(me?.status_emoji ?? '');
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);

  const save = async (patch: { status: PresenceStatus; text: string; emoji: string; until: string | null }) => {
    if (!me) return;
    setBusy(true);
    try {
      await people.updateStatus(me.id, { status: patch.status, status_text: patch.text.trim() || null, status_emoji: patch.emoji || null, status_until: patch.until });
      await reloadMe();
      onClose();
    } catch (error) {
      toast.error(messageOf(error));
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save({ status, text, emoji, until: untilFor(DURATIONS[duration].minutes) });
  };

  return (
    <Modal title="Set your status" onClose={onClose} width={460}>
      <form className="form dialog-form" onSubmit={submit}>
        <div className="status-options" role="radiogroup" aria-label="Status">
          {STATUS_OPTIONS.map(option => (
            <button type="button" key={option.value} role="radio" aria-checked={status === option.value} className={status === option.value ? 'on' : ''} onClick={() => setStatus(option.value)}>
              <i className="status-dot" style={{ background: option.color }} />{option.label}
            </button>
          ))}
        </div>
        <label>What are you up to?
          <span className="status-input">
            <span className="status-emoji-picks">
              {QUICK_EMOJI.map(item => (
                <button type="button" key={item} className={emoji === item ? 'on' : ''} aria-label={`Use ${item}`} onClick={() => setEmoji(emoji === item ? '' : item)}>{item}</button>
              ))}
            </span>
            <input className="text-input" value={text} maxLength={80} placeholder="In a meeting until 15:00" onChange={event => setText(event.target.value)} />
          </span>
        </label>
        <label>Clear after
          <select className="text-input" value={duration} onChange={event => setDuration(Number(event.target.value))}>
            {DURATIONS.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}
          </select>
        </label>
        <div className="actions">
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void save({ status: 'available', text: '', emoji: '', until: null })}>Clear status</button>
          <button className="btn" disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
