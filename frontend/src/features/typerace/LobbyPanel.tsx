import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/ui/Toast';
import type { Profile } from '../../core/types';
import { messageOf } from '../../core/AppError';
import type { TypeRaceService } from '../../services/TypeRaceService';
import type { RoomState } from './TypeRaceRoom';
import type { RaceDuration, RaceLanguage } from './typerace';

export const LANGUAGES: { value: RaceLanguage; label: string }[] = [
  { value: 'nl', label: 'Nederlands' },
  { value: 'en', label: 'English' },
];
export const DURATIONS: RaceDuration[] = [15, 30, 60];

interface LobbyPanelProps {
  state: RoomState;
  meId: string;
  service: TypeRaceService;
  profileById: (id: string) => Profile | undefined;
  onLeave: () => void;
  /** True na een afgelopen ronde, dan heet de startknop "Play again". */
  playAgain: boolean;
}

/** De lobby: wie er meedoet, de instellingen (alleen de host kan ze wijzigen) en de startknop. */
export function LobbyPanel({ state, meId, service, profileById, onLeave, playAgain }: LobbyPanelProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const lobby = state.lobby!;
  const isHost = lobby.host_id === meId;
  // Alleen tijdens een lopende ronde wacht iemand op de volgende; in de lobby doet iedereen mee.
  const roundRunning = lobby.status === 'countdown' || lobby.status === 'playing';
  const waitingFor = (playFrom: number) => roundRunning && playFrom > lobby.round;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const setSettings = (language: RaceLanguage, duration: RaceDuration) => run(() => service.updateSettings(lobby.id, language, duration));

  return (
    <div className="tr-lobby">
      <section className="tr-card">
        <h2>Players <small>{state.players.length}/8</small></h2>
        <ul className="tr-players">
          {state.players.map(player => {
            const profile = profileById(player.user_id);
            const name = profile?.display_name ?? 'Player';
            return (
              <li key={player.user_id}>
                <Avatar name={name} color={profile?.avatar_color ?? '#4a4a4a'} size="sm" />
                <span className="tr-pname">{name}</span>
                {player.user_id === meId && <span className="tr-tag">you</span>}
                {player.user_id === lobby.host_id && <span className="tr-tag host"><Icon name="star" size={11} />host</span>}
                {waitingFor(player.play_from) && <span className="tr-tag wait">next round</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="tr-card">
        <h2>Settings</h2>
        <div className="tr-setting">
          <span className="tr-label">Language</span>
          <div className="tr-seg" role="radiogroup" aria-label="Language">
            {LANGUAGES.map(item => (
              <button key={item.value} role="radio" aria-checked={lobby.language === item.value} className={lobby.language === item.value ? 'on' : ''}
                disabled={!isHost || busy} onClick={() => void setSettings(item.value, lobby.duration_seconds)}>{item.label}</button>
            ))}
          </div>
        </div>
        <div className="tr-setting">
          <span className="tr-label">Duration</span>
          <div className="tr-seg" role="radiogroup" aria-label="Duration">
            {DURATIONS.map(seconds => (
              <button key={seconds} role="radio" aria-checked={lobby.duration_seconds === seconds} className={lobby.duration_seconds === seconds ? 'on' : ''}
                disabled={!isHost || busy} onClick={() => void setSettings(lobby.language, seconds)}>{seconds}s</button>
            ))}
          </div>
        </div>
        {!isHost && <p className="tr-note">Only the host can change the settings and start the round.</p>}
        <div className="tr-actions">
          {isHost
            ? <button className="btn" disabled={busy} onClick={() => void run(() => service.start(lobby.id))}>{playAgain ? 'Play again' : 'Start race'}</button>
            : <span className="tr-waiting">Waiting for the host to {playAgain ? 'start the next round' : 'start'}…</span>}
          <button className="btn secondary" onClick={onLeave}>Leave lobby</button>
        </div>
      </section>
    </div>
  );
}
