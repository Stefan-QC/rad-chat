import { useState, type FormEvent } from 'react';
import { useServices } from '../../app/ServicesContext';
import { messageOf } from '../../core/AppError';
import { Icon } from '../Icon';
import { Modal } from '../ui/Modal';
import { Switch } from '../ui/Switch';
import { useToast } from '../ui/Toast';

const CLOSING: { label: string; hours: number | null }[] = [
  { label: 'Stays open', hours: null },
  { label: 'Closes in 1 hour', hours: 1 },
  { label: 'Closes in 1 day', hours: 24 },
  { label: 'Closes in 1 week', hours: 168 },
];

/** Dialoog om een peiling met 2 tot 10 opties in het kanaal te plaatsen. */
export function CreatePollDialog({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const { polls } = useServices();
  const toast = useToast();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [closing, setClosing] = useState(0);
  const [busy, setBusy] = useState(false);
  const filled = options.map(o => o.trim()).filter(Boolean);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const hours = CLOSING[closing].hours;
      await polls.create(channelId, { question: question.trim(), options: filled, multiple, closesAt: hours ? new Date(Date.now() + hours * 3_600_000).toISOString() : null });
      onClose();
    } catch (error) {
      toast.error(messageOf(error));
      setBusy(false);
    }
  };

  return (
    <Modal title="Create a poll" onClose={onClose} width={520}>
      <form className="form dialog-form" onSubmit={submit}>
        <label>Question
          <input className="text-input" autoFocus required maxLength={200} value={question} placeholder="Where shall we have lunch?" onChange={event => setQuestion(event.target.value)} />
        </label>
        <fieldset className="poll-options">
          <legend>Options</legend>
          {options.map((option, index) => (
            <span key={index} className="password-row">
              <input className="text-input" value={option} maxLength={100} placeholder={`Option ${index + 1}`} aria-label={`Option ${index + 1}`} onChange={event => setOptions(options.map((o, i) => (i === index ? event.target.value : o)))} />
              {options.length > 2 && <button type="button" className="iconbtn" aria-label={`Remove option ${index + 1}`} onClick={() => setOptions(options.filter((_, i) => i !== index))}><Icon name="close" size={16} /></button>}
            </span>
          ))}
          {options.length < 10 && <button type="button" className="btn secondary small" onClick={() => setOptions([...options, ''])}>Add option</button>}
        </fieldset>
        <Switch label="Allow several answers" checked={multiple} onChange={setMultiple} />
        <label>Closing
          <select className="text-input" value={closing} onChange={event => setClosing(Number(event.target.value))}>
            {CLOSING.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}
          </select>
        </label>
        <div className="actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !question.trim() || filled.length < 2}>Post poll</button>
        </div>
      </form>
    </Modal>
  );
}
