import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { TypingEngine } from './TypingEngine';
import { RaceTracks } from './RaceTracks';
import type { RoomState, TypeRaceRoom } from './TypeRaceRoom';
import { WordsView } from './WordsView';
import { liveStandings, type LiveProgress } from './standings';
import { parseTime, racePhase } from './typerace';
import { useRaceKeys } from './useRaceKeys';

const BROADCAST_MS = 250;
const REPORT_MS = 2000;
const TICK_MS = 100;

interface RaceViewProps {
  room: TypeRaceRoom;
  state: RoomState;
  meId: string;
}

const ordinal = (n: number) => {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const rest = n % 100;
  return n + (suffixes[(rest - 20) % 10] ?? suffixes[rest] ?? suffixes[0]);
};

/** De race zelf: statistieken, de racebanen van alle spelers en het tekstveld waarop je rechtstreeks typt. */
export function RaceView({ room, state, meId }: RaceViewProps) {
  const { profileById } = useWorkspace();
  const lobby = state.lobby!;
  const text = lobby.text ?? '';
  const startsAt = parseTime(lobby.starts_at!);
  const endsAt = parseTime(lobby.ends_at!);

  const engine = useMemo(() => new TypingEngine(text), [text, lobby.round]);
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(() => room.clock.now());
  const participants = state.players.filter(player => player.play_from <= lobby.round);
  const isParticipant = participants.some(player => player.user_id === meId);
  // Wie midden in een ronde terugkomt (vernieuwde pagina) heeft zijn getypte tekst niet meer en kijkt de ronde uit.
  const [rejoined] = useState(() => racePhase(lobby, room.clock.now()) !== 'countdown' && state.results.some(result => result.user_id === meId));

  useEffect(() => {
    const timer = setInterval(() => setNow(room.clock.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [room]);

  const phase = racePhase(lobby, now);
  const typing = isParticipant && !rejoined && phase === 'playing' && !engine.finished;
  useRaceKeys(typing, engine, () => setVersion(v => v + 1));

  const elapsed = Math.max(0, Math.min(now, endsAt) - startsAt);
  const stats = engine.stats(elapsed);
  const own: LiveProgress | null = isParticipant && !rejoined ? { userId: meId, ...stats, finished: engine.finished } : null;
  const rows = liveStandings(participants, state.results, state.live, meId, own);
  const position = rows.findIndex(row => row.userId === meId) + 1;

  // Voortgang doorgeven: snel via broadcast, en af en toe opgeslagen bij de server (die rekent alles na).
  const latest = useRef({ engine, own, phase, round: lobby.round });
  latest.current = { engine, own, phase, round: lobby.round };
  const finalSent = useRef(false);
  useEffect(() => { finalSent.current = false; }, [lobby.round]);

  useEffect(() => {
    if (!isParticipant || rejoined) return;
    let lastReport = 0;
    const timer = setInterval(() => {
      const { engine: current, phase: currentPhase, round } = latest.current;
      if (currentPhase !== 'playing') return;
      const elapsedNow = Math.max(0, Math.min(room.clock.now(), endsAt) - startsAt);
      const snapshot = current.stats(elapsedNow);
      room.broadcast({ correctChars: snapshot.correctChars, progress: snapshot.progress, wpm: snapshot.wpm, accuracy: snapshot.accuracy, finished: current.finished });
      if (Date.now() - lastReport >= REPORT_MS && !current.finished) {
        lastReport = Date.now();
        void room.report({ round, correctChars: snapshot.correctChars, keystrokes: snapshot.keystrokes, correctKeystrokes: snapshot.correctKeystrokes, finished: false });
      }
    }, BROADCAST_MS);
    return () => clearInterval(timer);
  }, [room, isParticipant, rejoined, startsAt, endsAt]);

  // Het eindresultaat: meteen als de tekst af is, anders zodra de tijd om is.
  useEffect(() => {
    if (!isParticipant || rejoined || finalSent.current) return;
    if (!engine.finished && phase !== 'settling' && phase !== 'finished') return;
    if (phase === 'countdown') return;
    finalSent.current = true;
    const elapsedFinal = Math.max(0, Math.min(room.clock.now(), endsAt) - startsAt);
    const snapshot = engine.stats(elapsedFinal);
    room.broadcast({ correctChars: snapshot.correctChars, progress: snapshot.progress, wpm: snapshot.wpm, accuracy: snapshot.accuracy, finished: engine.finished });
    void room.report({ round: lobby.round, correctChars: snapshot.correctChars, keystrokes: snapshot.keystrokes, correctKeystrokes: snapshot.correctKeystrokes, finished: engine.finished });
  }, [engine, version, phase, isParticipant, rejoined, room, lobby.round, startsAt, endsAt]);

  const countdown = Math.max(1, Math.ceil((startsAt - now) / 1000));
  const remaining = Math.max(0, Math.min(lobby.duration_seconds, Math.ceil((endsAt - now) / 1000)));
  const spectating = !isParticipant || rejoined;

  return (
    <div className="tr-race">
      <div className="tr-stats" aria-live="off">
        <div className="tr-stat time"><b>{phase === 'countdown' ? lobby.duration_seconds : remaining}</b><small>seconds</small></div>
        <div className="tr-stat"><b>{Math.round(stats.wpm)}</b><small>wpm</small></div>
        <div className="tr-stat"><b>{Math.round(stats.accuracy)}%</b><small>accuracy</small></div>
        <div className="tr-stat"><b>{Math.floor(stats.progress)}%</b><small>progress</small></div>
        <div className="tr-stat"><b>{position > 0 ? ordinal(position) : '–'}</b><small>position</small></div>
      </div>

      <RaceTracks rows={rows} meId={meId} profileById={id => profileById(id)} />

      <div className={`tr-stage${phase === 'countdown' ? ' waiting' : ''}${phase === 'settling' || phase === 'finished' ? ' over' : ''}`}>
        <WordsView engine={engine} version={version} />
        {phase === 'countdown' && <div className="tr-countdown" key={countdown} aria-live="assertive">{countdown}</div>}
        {(phase === 'settling' || phase === 'finished') && <div className="tr-timeup">{engine.finished ? 'Finished!' : 'Time!'}</div>}
      </div>

      <p className="tr-hint" role="status">
        {spectating
          ? (rejoined ? 'You rejoined during this round, so you are watching. You play again in the next round.' : 'A round is in progress. You join the next round.')
          : phase === 'countdown' ? 'Get ready: just start typing when the countdown ends.'
            : phase === 'playing' ? (stats.keystrokes === 0 ? 'Start typing to begin.' : 'Backspace fixes mistakes. Ctrl+Backspace deletes a word.')
              : 'Collecting the final results…'}
      </p>
    </div>
  );
}
