import { useCallback, useState } from 'react';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { messageOf } from '../core/AppError';
import type { Message } from '../core/types';
import type { OutgoingAttachment } from '../services/MessageService';

/** Verstuurt een bericht met eventuele geplakte afbeeldingen of een GIF en onthoudt de laatste fout. */
export function useMessageSender(channelId: string, parentId: number | null = null) {
  const { messages, attachments } = useServices();
  const { me } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (text: string, files: File[] = [], extra: OutgoingAttachment[] = []): Promise<Message | null> => {
    if (!me) return null;
    setError(null);
    const uploaded: OutgoingAttachment[] = [];
    try {
      for (const file of files) uploaded.push(await attachments.upload(channelId, me.id, file));
      return await messages.send(channelId, text, { parentId, attachments: [...uploaded, ...extra] });
    } catch (e) {
      await attachments.discard(uploaded.flatMap(item => (item.path ? [item.path] : []))).catch(() => undefined);
      setError(messageOf(e));
      return null;
    }
  }, [me, messages, attachments, channelId, parentId]);

  return { send, error, setError };
}
