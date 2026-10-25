import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { useWorkspace } from '../app/WorkspaceContext';
import { Avatar } from '../components/Avatar';
import { PeoplePicker } from '../components/chat/PeoplePicker';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/ui/Toast';
import { messageOf } from '../core/AppError';
import { formatDateTime } from '../core/format';
import type { Kudo } from '../core/types';

const DAILY_LIMIT = 3;

/** Complimenten voor collega's: een formulier om kudos te geven en een feed met de laatste complimenten. */
export function KudosPage() {
  const { social } = useServices();
  const { me } = useAuth();
  const { profiles, profileById } = useWorkspace();
  const toast = useToast();
  const [kudos, setKudos] = useState<Kudo[]>([]);
  const [to, setTo] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    social.listKudos().then(setKudos).catch(() => undefined);
  }, [social]);
  useEffect(() => {
    reload();
    return social.watchKudos(reload);
  }, [social, reload]);

  const people = useMemo(() => profiles.filter(p => p.id !== me?.id && !p.deactivated_at && p.role !== 'guest'), [profiles, me?.id]);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const givenToday = kudos.filter(k => k.from_user === me?.id && new Date(k.created_at) >= startOfDay).length;
  const left = Math.max(0, DAILY_LIMIT - givenToday);

  const give = async (event: FormEvent) => {
    event.preventDefault();
    if (to.length !== 1) return;
    setBusy(true);
    try {
      await social.giveKudos(to[0], message.trim());
      toast.success('Kudos sent! They get 5 points.');
      setTo([]);
      setMessage('');
      reload();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Kudos" />
      <div className="page wide two-col kudos">
        <form className="col card form kudos-form" onSubmit={give}>
          <h2>Say thanks</h2>
          <p className="muted">Give a colleague a compliment. They earn 5 points on the leaderboard. You have <b>{left}</b> of {DAILY_LIMIT} kudos left today.</p>
          <div className="dialog-section">
            <span className="label">Who deserves it?</span>
            <PeoplePicker people={people} selected={to} onChange={setTo} single />
          </div>
          <label>What did they do?
            <textarea className="text-input" rows={3} maxLength={280} required value={message} placeholder="Thanks for staying late to fix the release!" onChange={event => setMessage(event.target.value)} />
          </label>
          <div className="actions"><button className="btn" disabled={busy || left === 0 || to.length !== 1 || !message.trim()}>{left === 0 ? 'Come back tomorrow' : 'Send kudos'}</button></div>
        </form>
        <section className="col detail">
          <h2 className="feed-title">Recent kudos</h2>
          {kudos.length === 0 && <div className="empty-state"><b>No kudos yet.</b><span>Be the first to say thanks.</span></div>}
          <ul className="kudos-feed">
            {kudos.map(item => {
              const from = profileById(item.from_user);
              const target = profileById(item.to_user);
              return (
                <li key={item.id} className="card">
                  <span className="kudos-star" aria-hidden="true">🌟</span>
                  <div>
                    <p><b>{from?.display_name ?? 'Someone'}</b> thanked <b>{target?.display_name ?? 'a colleague'}</b></p>
                    <blockquote>{item.message}</blockquote>
                    <small className="muted">{formatDateTime(item.created_at)}</small>
                  </div>
                  {target && <Avatar name={target.display_name} color={target.avatar_color} size="sm" />}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}
