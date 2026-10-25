import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Attachment, Message, Reaction } from '../core/types';
import { useServices } from './ServicesContext';

type MessageRef = Pick<Message, 'id' | 'attachment_count'>;

interface MessageExtrasValue {
  reactionsOf: (messageId: number) => Reaction[];
  attachmentsOf: (messageId: number) => Attachment[];
  /** Vraagt reacties en bijlagen op voor berichten die nog niet geladen zijn. */
  ensure: (messages: MessageRef[]) => void;
}

const MessageExtrasContext = createContext<MessageExtrasValue | null>(null);
const NO_REACTIONS: Reaction[] = [];
const NO_ATTACHMENTS: Attachment[] = [];

/** Bewaart de reacties en bijlagen van alle zichtbare berichten en houdt de reacties live bij. */
export function MessageExtrasProvider({ children }: { children: ReactNode }) {
  const { reactions: reactionService, attachments: attachmentService } = useServices();
  const [reactions, setReactions] = useState<Map<number, Reaction[]>>(new Map());
  const [attachments, setAttachments] = useState<Map<number, Attachment[]>>(new Map());
  const loadedReactions = useRef(new Set<number>());
  const loadedAttachments = useRef(new Set<number>());

  useEffect(() => reactionService.subscribe(event => {
    setReactions(current => {
      const next = new Map(current);
      const list = (next.get(event.reaction.message_id) ?? []).filter(
        r => !(r.user_id === event.reaction.user_id && r.emoji === event.reaction.emoji),
      );
      next.set(event.reaction.message_id, event.type === 'add' ? [...list, event.reaction] : list);
      return next;
    });
  }), [reactionService]);

  const ensure = useCallback((messages: MessageRef[]) => {
    const missingReactions = messages.map(m => m.id).filter(id => !loadedReactions.current.has(id));
    if (missingReactions.length > 0) {
      missingReactions.forEach(id => loadedReactions.current.add(id));
      reactionService.listForMessages(missingReactions).then(rows => {
        setReactions(current => {
          const next = new Map(current);
          for (const id of missingReactions) next.set(id, rows.filter(r => r.message_id === id));
          return next;
        });
      }).catch(() => missingReactions.forEach(id => loadedReactions.current.delete(id)));
    }
    const missingAttachments = messages.filter(m => m.attachment_count > 0 && !loadedAttachments.current.has(m.id)).map(m => m.id);
    if (missingAttachments.length > 0) {
      missingAttachments.forEach(id => loadedAttachments.current.add(id));
      attachmentService.listForMessages(missingAttachments).then(rows => {
        setAttachments(current => {
          const next = new Map(current);
          for (const id of missingAttachments) next.set(id, rows.filter(a => a.message_id === id));
          return next;
        });
      }).catch(() => missingAttachments.forEach(id => loadedAttachments.current.delete(id)));
    }
  }, [reactionService, attachmentService]);

  const reactionsOf = useCallback((messageId: number) => reactions.get(messageId) ?? NO_REACTIONS, [reactions]);
  const attachmentsOf = useCallback((messageId: number) => attachments.get(messageId) ?? NO_ATTACHMENTS, [attachments]);
  const value = useMemo(() => ({ reactionsOf, attachmentsOf, ensure }), [reactionsOf, attachmentsOf, ensure]);
  return <MessageExtrasContext.Provider value={value}>{children}</MessageExtrasContext.Provider>;
}

export function useMessageExtras(): MessageExtrasValue {
  const value = useContext(MessageExtrasContext);
  if (!value) throw new Error('useMessageExtras must be used inside MessageExtrasProvider');
  return value;
}
