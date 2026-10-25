import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { messageOf } from '../core/AppError';
import type { Message } from '../core/types';

const byId = (a: Message, b: Message) => a.id - b.id;

/** Houdt het hoofdbericht en alle antwoorden van één draadje bij, inclusief live wijzigingen. */
export function useThread(channelId: string, rootId: number) {
  const { messages: service } = useServices();
  const [root, setRoot] = useState<Message | null>(null);
  const [replies, setReplies] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setRoot(null);
    setReplies([]);
    setError(null);
    const stop = service.subscribe(channelId, {
      onInsert: message => {
        if (message.parent_id === rootId) setReplies(list => (list.some(m => m.id === message.id) ? list : [...list, message].sort(byId)));
      },
      onUpdate: message => {
        if (message.id === rootId) setRoot(message);
        if (message.parent_id === rootId) setReplies(list => list.map(m => (m.id === message.id ? message : m)));
      },
    });
    Promise.all([service.getById(rootId), service.listReplies(rootId)])
      .then(([loadedRoot, loadedReplies]) => {
        if (!active) return;
        setRoot(loadedRoot);
        setReplies(list => [...loadedReplies, ...list.filter(m => !loadedReplies.some(r => r.id === m.id))].sort(byId));
      })
      .catch(e => active && setError(messageOf(e)));
    return () => {
      active = false;
      stop();
    };
  }, [channelId, rootId, service]);

  /** Toont een net verstuurd antwoord direct, ook als de realtime-melding later aankomt. */
  const append = useCallback((message: Message) => {
    setReplies(list => (list.some(m => m.id === message.id) ? list : [...list, message].sort(byId)));
  }, []);

  return { root, replies, error, append };
}
