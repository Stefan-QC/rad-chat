import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Reaction } from '../core/types';
import { useServices } from './ServicesContext';

interface MessageExtrasValue {
  reactionsOf: (messageId: number) => Reaction[];
  /** Vraagt reacties op voor berichten die nog niet geladen zijn. */
  ensure: (messageIds: number[]) => void;
}

const MessageExtrasContext = createContext<MessageExtrasValue | null>(null);
const EMPTY: Reaction[] = [];

/** Bewaart de reacties van alle zichtbare berichten en houdt ze live bij. */
export function MessageExtrasProvider({ children }: { children: ReactNode }) {
  const { reactions: service } = useServices();
  const [reactions, setReactions] = useState<Map<number, Reaction[]>>(new Map());
  const loaded = useRef(new Set<number>());

  useEffect(() => service.subscribe(event => {
    setReactions(current => {
      const next = new Map(current);
      const list = (next.get(event.reaction.message_id) ?? []).filter(
        r => !(r.user_id === event.reaction.user_id && r.emoji === event.reaction.emoji),
      );
      next.set(event.reaction.message_id, event.type === 'add' ? [...list, event.reaction] : list);
      return next;
    });
  }), [service]);

  const ensure = useCallback((messageIds: number[]) => {
    const missing = messageIds.filter(id => !loaded.current.has(id));
    if (missing.length === 0) return;
    missing.forEach(id => loaded.current.add(id));
    service.listForMessages(missing).then(rows => {
      setReactions(current => {
        const next = new Map(current);
        for (const id of missing) next.set(id, rows.filter(r => r.message_id === id));
        return next;
      });
    }).catch(() => missing.forEach(id => loaded.current.delete(id)));
  }, [service]);

  const reactionsOf = useCallback((messageId: number) => reactions.get(messageId) ?? EMPTY, [reactions]);
  const value = useMemo(() => ({ reactionsOf, ensure }), [reactionsOf, ensure]);
  return <MessageExtrasContext.Provider value={value}>{children}</MessageExtrasContext.Provider>;
}

export function useMessageExtras(): MessageExtrasValue {
  const value = useContext(MessageExtrasContext);
  if (!value) throw new Error('useMessageExtras must be used inside MessageExtrasProvider');
  return value;
}
