import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import type { Profile } from '../../core/types';
import type { RoomState } from './TypeRaceRoom';
import { formatFinish, rankResults, type RaceResult } from './typerace';

interface ResultsPanelProps {
  state: RoomState;
  meId: string;
  profileById: (id: string) => Profile | undefined;
}

/** Zorgt dat ook deelnemers zonder opgeslagen uitslag (bijvoorbeeld nooit getypt) in de lijst staan, met nullen. */
function withMissingParticipants(state: RoomState): RaceResult[] {
  const lobby = state.lobby!;
  const missing = state.players
    .filter(player => player.play_from <= lobby.round && !state.results.some(result => result.user_id === player.user_id))
    .map<RaceResult>(player => ({
      lobby_id: lobby.id, round: lobby.round, user_id: player.user_id, correct_chars: 0, keystrokes: 0, correct_keystrokes: 0,
      wpm: 0, accuracy: 100, progress: 0, finished: false, finished_ms: null,
    }));
  return [...state.results, ...missing];
}

/** De uitslag van de laatste ronde: positie, WPM, nauwkeurigheid, voortgang en eindtijd, met de winnaar uitgelicht. */
export function ResultsPanel({ state, meId, profileById }: ResultsPanelProps) {
  const ranked = rankResults(withMissingParticipants(state));
  const winner = ranked[0] && (ranked[0].finished || ranked[0].progress > 0) ? ranked[0] : null;
  const winnerName = winner ? profileById(winner.user_id)?.display_name ?? 'Player' : null;
  return (
    <section className="tr-card tr-results" aria-label="Results">
      <header>
        <Icon name="trophy" size={22} />
        <div>
          <h2>{winnerName ? `${winnerName} wins!` : 'Nobody scored this round'}</h2>
          <small>{winner?.finished ? 'First to finish the whole text.' : 'Most correct progress when the time ran out.'}</small>
        </div>
      </header>
      <table>
        <thead>
          <tr><th>#</th><th>Player</th><th>WPM</th><th>Accuracy</th><th>Progress</th><th>Time</th></tr>
        </thead>
        <tbody>
          {ranked.map(result => {
            const profile = profileById(result.user_id);
            const name = profile?.display_name ?? 'Player';
            return (
              <tr key={result.user_id} className={`${result.place === 1 && winner ? 'winner' : ''}${result.user_id === meId ? ' me' : ''}`}>
                <td>{result.place === 1 && winner ? <Icon name="trophy" size={15} /> : result.place}</td>
                <td><span className="tr-who"><Avatar name={name} color={profile?.avatar_color ?? '#4a4a4a'} size="xs" />{name}{result.user_id === meId && <small>you</small>}</span></td>
                <td><b>{Math.round(result.wpm)}</b></td>
                <td>{Math.round(result.accuracy)}%</td>
                <td>{Math.floor(result.progress)}%</td>
                <td>{result.finished ? formatFinish(result.finished_ms) : 'DNF'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
