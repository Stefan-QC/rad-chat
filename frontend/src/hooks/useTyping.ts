import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { useWorkspace } from '../app/WorkspaceContext';

/** Wie er in dit kanaal typt, plus de functies om het eigen typen door te geven. */
export function useTyping(channelId: string) {
  const { typing } = useServices();
  const { me } = useAuth();
  const { profileById } = useWorkspace();
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (!me) return;
    const stop = typing.on('change', setIds);
    typing.join(channelId, me.id);
    return () => {
      stop();
      typing.leave();
    };
  }, [typing, channelId, me]);

  const names = useMemo(
    () => ids.map(id => profileById(id)?.display_name).filter((name): name is string => Boolean(name)),
    [ids, profileById],
  );
  const notifyTyping = useCallback(() => typing.notifyTyping(), [typing]);
  const notifyStopped = useCallback(() => typing.notifyStopped(), [typing]);
  return { names, notifyTyping, notifyStopped };
}
