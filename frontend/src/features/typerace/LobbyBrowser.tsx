import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { Avatar } from '../../components/Avatar';
import { useToast } from '../../components/ui/Toast';
import { messageOf } from '../../core/AppError';
import { useAsync } from '../../hooks/useAsync';
import { DURATIONS, LANGUAGES } from './LobbyPanel';
import { raceErrorMessage, type RaceDuration, type RaceLanguage } from './typerace';

const STATUS_LABEL = { lobby: 'Waiting', countdown: 'Starting', playing: 'Racing', finished: 'Waiting' } as const;

/** Overzicht van de open lobby's om te joinen, en een formulier om zelf een lobby te maken. */
export function LobbyBrowser({ onEnter }: { onEnter: (lobbyId: string) => void }) {
  const { typeRace } = useServices();
  const { profileById } = useWorkspace();
  const toast = useToast();
  const [language, setLanguage] = useState<RaceLanguage>('en');
  const [duration, setDuration] = useState<RaceDuration>(30);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => typeRace.openLobbies(), [typeRace]);
  const { data: lobbies, loading, reload } = useAsync(load);

  useEffect(() => typeRace.watchLobbyList(() => void reload()), [typeRace, reload]);
  useEffect(() => {
    const timer = setInterval(() => void reload(), 5000);
    return () => clearInterval(timer);
  }, [reload]);

  const enter = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      onEnter(await action());
    } catch (e) {
      const message = messageOf(e);
      toast.error(message.includes('lobby_full') ? raceErrorMessage('lobby_full') : message.includes('not_found') ? raceErrorMessage('not_found') : message);
      void reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tr-browser">
      <section className="tr-card">
        <h2>Create a lobby</h2>
        <p className="tr-note">You become the host: you choose the language and duration and start the race.</p>
        <div className="tr-setting">
          <span className="tr-label">Language</span>
          <div className="tr-seg" role="radiogroup" aria-label="Language">
            {LANGUAGES.map(item => (
              <button key={item.value} role="radio" aria-checked={language === item.value} className={language === item.value ? 'on' : ''} onClick={() => setLanguage(item.value)}>{item.label}</button>
            ))}
          </div>
        </div>
        <div className="tr-setting">
          <span className="tr-label">Duration</span>
          <div className="tr-seg" role="radiogroup" aria-label="Duration">
            {DURATIONS.map(seconds => (
              <button key={seconds} role="radio" aria-checked={duration === seconds} className={duration === seconds ? 'on' : ''} onClick={() => setDuration(seconds)}>{seconds}s</button>
            ))}
          </div>
        </div>
        <div className="tr-actions">
          <button className="btn" disabled={busy} onClick={() => void enter(() => typeRace.create(language, duration))}>Create lobby</button>
        </div>
      </section>

      <section className="tr-card">
        <h2>Open lobbies</h2>
        {loading && !lobbies && <p className="tr-note">Loading…</p>}
        {lobbies && lobbies.length === 0 && <p className="tr-note">No lobbies yet. Create one and ask a colleague to join.</p>}
        <ul className="tr-lobbies">
          {lobbies?.map(item => {
            const host = profileById(item.host_id);
            const hostName = host?.display_name ?? 'Someone';
            return (
              <li key={item.lobby_id}>
                <Avatar name={hostName} color={host?.avatar_color ?? '#4a4a4a'} size="sm" />
                <span className="tr-lobby-name"><b>{hostName}</b><small>{item.language === 'nl' ? 'Nederlands' : 'English'} · {item.duration_seconds}s</small></span>
                <span className={`tr-badge ${item.status}`}>{STATUS_LABEL[item.status]}</span>
                <span className="tr-count">{item.players}/8</span>
                <button className="btn secondary small" disabled={busy || item.players >= 8} onClick={() => void enter(async () => { await typeRace.join(item.lobby_id); return item.lobby_id; })}>
                  {item.players >= 8 ? 'Full' : 'Join'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
