import { useEffect, useState } from 'react';
import { usePins } from '../../app/PinsContext';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { formatDateTime } from '../../core/format';
import type { Message } from '../../core/types';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { RichText } from '../RichText';

/** Zijpaneel met alle vastgepinde berichten van het kanaal. */
export function PinnedPanel({ onClose }: { onClose: () => void }) {
  const { messages: service } = useServices();
  const { profileById } = useWorkspace();
  const { pins, canPin, togglePin } = usePins();
  const [messages, setMessages] = useState<Message[]>([]);
  const idsKey = pins.map(p => p.message_id).join(',');

  useEffect(() => {
    let active = true;
    service.listByIds(pins.map(p => p.message_id)).then(rows => active && setMessages(rows)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [service, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className="chat-side" aria-label="Pinned messages">
      <header className="side-title">
        <h2>Pinned messages</h2>
        <button className="iconbtn" aria-label="Close pinned messages" onClick={onClose}><Icon name="close" size={18} /></button>
      </header>
      <div className="side-scroll">
        {pins.length === 0 && <p className="side-empty roomy">Nothing is pinned yet. Moderators can pin important messages.</p>}
        {pins.map(pin => {
          const message = messages.find(m => m.id === pin.message_id);
          const author = profileById(message?.user_id);
          if (!message) return null;
          return (
            <article key={pin.message_id} className="pin-card">
              <header>
                <Avatar name={author?.display_name ?? '?'} color={author?.avatar_color ?? '#4a4a4a'} size="xs" />
                <b>{author?.display_name ?? 'Unknown user'}</b>
                <time>{formatDateTime(message.created_at)}</time>
              </header>
              <p><RichText text={message.body} me="" /></p>
              {canPin && <button className="link" onClick={() => void togglePin(message.id)}>Unpin</button>}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
