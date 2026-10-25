import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { messageOf } from '../../core/AppError';
import type { ExportFormat, JobName } from '../../services/AdminService';
import { useToast } from '../ui/Toast';

const JOBS: { name: JobName; label: string; description: string }[] = [
  { name: 'expire_guests', label: 'Deactivate expired guests', description: 'Closes the accounts of guests whose access has ended.' },
  { name: 'purge_messages', label: 'Apply message retention', description: 'Deletes messages older than the retention period.' },
  { name: 'post_celebrations', label: 'Post birthdays and anniversaries', description: 'Posts today\'s celebrations in the announcements channel.' },
  { name: 'run_coffee_round', label: 'Start a coffee round', description: 'Pairs up colleagues who joined coffee matching.' },
];

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Bewaartermijn, export van berichten en handmatig starten van onderhoudstaken. */
export function DataTab() {
  const { admin } = useServices();
  const { channels, presenter } = useWorkspace();
  const toast = useToast();
  const [days, setDays] = useState<number | null>(null);
  const [channelId, setChannelId] = useState('');
  const [since, setSince] = useState('');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    admin.getRetentionDays().then(setDays).catch(error => toast.error(messageOf(error)));
  }, [admin, toast]);

  const saveRetention = async (event: FormEvent) => {
    event.preventDefault();
    if (days === null) return;
    setBusy('retention');
    try {
      setDays(await admin.setRetentionDays(days));
      toast.success(days === 0 ? 'Messages are now kept forever.' : `Messages older than ${days} days will be deleted.`);
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(null);
    }
  };

  const exportMessages = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('export');
    try {
      const { blob, filename } = await admin.exportMessages(channelId || null, since ? new Date(since).toISOString() : null, format);
      saveBlob(blob, filename);
      toast.success('Export downloaded.');
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(null);
    }
  };

  const runJob = useCallback(async (name: JobName) => {
    if (!window.confirm('Run this task now?')) return;
    setBusy(name);
    try {
      const result = await admin.runJob(name);
      toast.success(`Done: ${JSON.stringify(result)}`);
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(null);
    }
  }, [admin, toast]);

  const exportable = channels.filter(c => c.kind !== 'voice' && !c.is_private);

  return (
    <div className="data-tab">
      <form className="card form" onSubmit={saveRetention}>
        <h3>Message retention</h3>
        <p className="muted">Older messages are deleted automatically every night. Use 0 to keep everything.</p>
        <label>Keep messages for (days)
          <input className="text-input" type="number" min={0} max={3650} value={days ?? ''} disabled={days === null} onChange={event => setDays(Number(event.target.value))} />
        </label>
        <div className="actions"><button className="btn" disabled={days === null || busy === 'retention'}>Save</button></div>
      </form>

      <form className="card form" onSubmit={exportMessages}>
        <h3>Export messages</h3>
        <p className="muted">Download a copy of chat history for compliance. Exports are written to the audit log.</p>
        <label>Channel
          <select className="text-input" value={channelId} onChange={event => setChannelId(event.target.value)}>
            <option value="">All channels</option>
            {exportable.map(c => <option key={c.id} value={c.id}>{presenter.title(c)}</option>)}
          </select>
        </label>
        <label>Since (optional)
          <input className="text-input" type="date" value={since} onChange={event => setSince(event.target.value)} />
        </label>
        <label>Format
          <select className="text-input" value={format} onChange={event => setFormat(event.target.value as ExportFormat)}>
            <option value="csv">CSV (Excel)</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <div className="actions"><button className="btn" disabled={busy === 'export'}>{busy === 'export' ? 'Preparing…' : 'Download'}</button></div>
      </form>

      <div className="card">
        <h3>Maintenance tasks</h3>
        <p className="muted">These run automatically when the scheduler is switched on. You can also start them by hand.</p>
        <ul className="job-list">
          {JOBS.map(job => (
            <li key={job.name}>
              <span><b>{job.label}</b><small>{job.description}</small></span>
              <button className="btn secondary small" disabled={busy === job.name} onClick={() => void runJob(job.name)}>{busy === job.name ? 'Running…' : 'Run now'}</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
