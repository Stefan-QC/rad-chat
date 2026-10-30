import { useEffect, useState } from 'react';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { useWorkspace } from '../app/WorkspaceContext';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { LobbyBrowser } from '../features/typerace/LobbyBrowser';
import { LobbyPanel } from '../features/typerace/LobbyPanel';
import { RaceView } from '../features/typerace/RaceView';
import { ResultsPanel } from '../features/typerace/ResultsPanel';
import { racePhase } from '../features/typerace/typerace';
import { useTypeRaceRoom } from '../hooks/useTypeRaceRoom';

/** Eén lobby: kiest op basis van de fase tussen de lobby, de race en de uitslag. */
function Room({ lobbyId, meId, onLeft }: { lobbyId: string; meId: string; onLeft: () => void }) {
  const { typeRace } = useServices();
  const { profileById } = useWorkspace();
  const { room, state } = useTypeRaceRoom(lobbyId, meId);

  useEffect(() => {
    if (!state.inLobby && !state.loading) onLeft();
  }, [state.inLobby, state.loading, onLeft]);

  if (!state.lobby) return <div className="page-loading">{state.error ?? 'Loading…'}</div>;
  const phase = racePhase(state.lobby, room.clock.now());
  const racing = phase === 'countdown' || phase === 'playing' || phase === 'settling';
  const leave = () => void room.leave().finally(onLeft);

  return (
    <div className="tr-room">
      {state.error && <p className="banner error" role="alert">{state.error}</p>}
      {racing
        ? <RaceView key={state.lobby.round} room={room} state={state} meId={meId} />
        : (
          <>
            {state.lobby.round > 0 && <ResultsPanel state={state} meId={meId} profileById={id => profileById(id)} />}
            <LobbyPanel state={state} meId={meId} service={typeRace} profileById={id => profileById(id)} onLeave={leave} playAgain={state.lobby.round > 0} />
          </>
        )}
      {racing && (
        <div className="tr-leave"><button className="btn secondary small" onClick={leave}>Leave lobby</button></div>
      )}
    </div>
  );
}

/** Type race: een multiplayer typewedstrijd met collega's, geïnspireerd op Monkeytype en TypeRacer. */
export function TypeRacePage() {
  const { me } = useAuth();
  const { typeRace } = useServices();
  const [lobbyId, setLobbyId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!me || me.role === 'guest') return;
    let alive = true;
    typeRace.myLobbyId(me.id).then(id => alive && setLobbyId(id)).catch(() => alive && setLobbyId(null));
    return () => { alive = false; };
  }, [typeRace, me]);

  return (
    <>
      <PageHeader title="Type race" prefix={<Icon name="keyboard" size={22} />} topic="Race your colleagues" />
      <div className="tr-page">
        {me?.role === 'guest' && <p className="banner error">Guests cannot play the type race.</p>}
        {me && me.role !== 'guest' && lobbyId === undefined && <div className="page-loading">Loading…</div>}
        {me && me.role !== 'guest' && lobbyId === null && <LobbyBrowser onEnter={setLobbyId} />}
        {me && me.role !== 'guest' && lobbyId && <Room lobbyId={lobbyId} meId={me.id} onLeft={() => setLobbyId(null)} />}
      </div>
    </>
  );
}
