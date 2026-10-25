import { useState } from 'react';
import { useServices } from '../../app/ServicesContext';
import { messageOf } from '../../core/AppError';
import type { Channel } from '../../core/types';
import { useThread } from '../../hooks/useThread';
import { Icon } from '../Icon';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

interface ThreadPanelProps {
  channel: Channel;
  rootId: number;
  title: string;
  onClose: () => void;
}

/** Zijpaneel met het hoofdbericht, de antwoorden en een invoerveld om te reageren. */
export function ThreadPanel({ channel, rootId, title, onClose }: ThreadPanelProps) {
  const { messages: service } = useServices();
  const { root, replies, error: loadError, append } = useThread(channel.id, rootId);
  const [error, setError] = useState<string | null>(null);

  const send = async (text: string) => {
    try {
      setError(null);
      append(await service.send(channel.id, text, { parentId: rootId }));
    } catch (e) {
      setError(messageOf(e));
    }
  };

  const thread = root ? [root, ...replies] : replies;
  return (
    <aside className="chat-side" aria-label="Thread">
      <header className="side-title">
        <h2>Thread</h2>
        <button className="iconbtn" aria-label="Close thread" onClick={onClose}><Icon name="close" size={18} /></button>
      </header>
      <MessageList title={title} channel={channel} messages={thread} hasMore={false} onLoadMore={() => undefined} onError={setError} showWelcome={false} />
      {(error || loadError) && <div className="banner error" role="alert">{error || loadError}</div>}
      <Composer channelName={title} placeholder="Reply in thread…" onSend={send} />
    </aside>
  );
}
