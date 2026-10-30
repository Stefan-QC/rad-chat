import { useEffect, useMemo, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { TypeRaceRoom, type RoomState } from '../features/typerace/TypeRaceRoom';

/** Verbindt React met één type-race-lobby; de verbinding stopt vanzelf als je de pagina verlaat. */
export function useTypeRaceRoom(lobbyId: string, userId: string): { room: TypeRaceRoom; state: RoomState } {
  const { typeRace, games } = useServices();
  const room = useMemo(() => new TypeRaceRoom(typeRace, games, lobbyId, userId), [typeRace, games, lobbyId, userId]);
  const [state, setState] = useState<RoomState>(room.snapshot);

  useEffect(() => {
    const stop = room.on('change', setState);
    room.start();
    return () => {
      stop();
      room.stop();
    };
  }, [room]);

  return { room, state };
}
