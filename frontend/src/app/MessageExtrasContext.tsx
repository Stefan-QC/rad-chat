import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Attachment, Message, PollData, Reaction } from '../core/types';
import { useServices } from './ServicesContext';

type MessageRef = Pick<Message, 'id' | 'attachment_count' | 'kind'>;

interface MessageExtrasValue {
  reactionsOf: (messageId: number) => Reaction[];
  attachmentsOf: (messageId: number) => Attachment[];
  pollOf: (messageId: number) => PollData | undefined;
  /** Laadt de zichtbare peilingen opnieuw, bijvoorbeeld na een stem. */
  refreshPolls: () => void;
  /** Vraagt reacties en bijlagen op voor berichten die nog niet geladen zijn. */
  ensure: (messages: MessageRef[]) => void;
}

const MessageExtrasContext = createContext<MessageExtrasValue | null>(null);
const NO_REACTIONS: Reaction[] = [];
const NO_ATTACHMENTS: Attachment[] = [];

/** Bewaart de reacties en bijlagen van alle zichtbare berichten en houdt de reacties live bij. */
export function MessageExtrasProvider({ children }: { children: ReactNode }) {
  const { reactions: reactionService, attachments: attachmentService, polls: pollService } = useServices();
  const [reactions, setReactions] = useState<Map<number, Reaction[]>>(new Map());
  const [attachments, setAttachments] = useState<Map<number, Attachment[]>>(new Map());
  const loadedReactions = useRef(new Set<number>());
  const loadedAttachments = useRef(new Set<number>());
  const [polls, setPolls] = useState<Map<number, PollData>>(new Map());
  const pollMessages = useRef(new Set<number>());

  const refreshPolls = useCallback(() => {
    const ids = [...pollMessages.current];
    if (ids.length === 0) return;
    pollService.listForMessages(ids).then(rows => setPolls(new Map(rows.map(row => [row.poll.message_id, row])))).catch(() => undefined);
  }, [pollService]);

  useEffect(() => pollService.watch(refreshPolls), [pollService, refreshPolls]);

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
    const newPolls = messages.filter(m => m.kind === 'poll' && !pollMessages.current.has(m.id)).map(m => m.id);
    if (newPolls.length > 0) {
      newPolls.forEach(id => pollMessages.current.add(id));
      refreshPolls();
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
  }, [reactionService, attachmentService, refreshPolls]);

  const reactionsOf = useCallback((messageId: number) => reactions.get(messageId) ?? NO_REACTIONS, [reactions]);
  const attachmentsOf = useCallback((messageId: number) => attachments.get(messageId) ?? NO_ATTACHMENTS, [attachments]);
  const pollOf = useCallback((messageId: number) => polls.get(messageId), [polls]);
  const value = useMemo(() => ({ reactionsOf, attachmentsOf, pollOf, refreshPolls, ensure }), [reactionsOf, attachmentsOf, pollOf, refreshPolls, ensure]);
  return <MessageExtrasContext.Provider value={value}>{children}</MessageExtrasContext.Provider>;
}

export function useMessageExtras(): MessageExtrasValue {
  const value = useContext(MessageExtrasContext);
  if (!value) throw new Error('useMessageExtras must be used inside MessageExtrasProvider');
  return value;
}
