import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { messageOf } from '../core/AppError';
import type { Message } from '../core/types';
import { PAGE_SIZE } from '../services/MessageService';

const byId = (a: Message, b: Message) => a.id - b.id;

/** Houdt de berichten van één kanaal bij: eerste pagina, oudere pagina's en live wijzigingen. */
export function useMessages(channelId: string) {
  const { messages: service } = useServices();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setMessages([]);
    setLoading(true);
    setError(null);
    const stop = service.subscribe(channelId, {
      onInsert: message => {
        if (message.parent_id === null) setMessages(list => (list.some(m => m.id === message.id) ? list : [...list, message].sort(byId)));
      },
      onUpdate: message => {
        if (message.parent_id === null) setMessages(list => list.map(m => (m.id === message.id ? message : m)));
      },
    });
    service
      .listPage(channelId)
      .then(page => {
        if (!active) return;
        setMessages(list => [...page, ...list.filter(m => !page.some(p => p.id === m.id))].sort(byId));
        setHasMore(page.length === PAGE_SIZE);
      })
      .catch(e => active && setError(messageOf(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      stop();
    };
  }, [channelId, service]);

  const loadMore = useCallback(async () => {
    const oldest = messages[0];
    if (!oldest) return;
    const page = await service.listPage(channelId, oldest.id);
    setMessages(list => [...page, ...list].sort(byId));
    setHasMore(page.length === PAGE_SIZE);
  }, [messages, channelId, service]);

  /** Toont een net verstuurd bericht direct, ook als de realtime-melding later of niet aankomt. */
  const append = useCallback((message: Message) => {
    setMessages(list => (list.some(m => m.id === message.id) ? list : [...list, message].sort(byId)));
  }, []);

  return { messages, loading, hasMore, error, loadMore, append };
}
