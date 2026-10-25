import type { Channel } from '../../core/types';
import { useMessageSender } from '../../hooks/useMessageSender';
import { useThread } from '../../hooks/useThread';
import { Icon } from '../Icon';
import type { GifItem } from '../../services/GifService';
import { Composer } from './Composer';
import { ComposerTools } from './ComposerTools';
import { MessageList } from './MessageList';

interface ThreadPanelProps {
  channel: Channel;
  rootId: number;
  title: string;
  onClose: () => void;
}

/** Zijpaneel met het hoofdbericht, de antwoorden en een invoerveld om te reageren. */
export function ThreadPanel({ channel, rootId, title, onClose }: ThreadPanelProps) {
  const { root, replies, error: loadError, append } = useThread(channel.id, rootId);
  const { send: sendMessage, error, setError } = useMessageSender(channel.id, rootId);

  const send = async (text: string, files: File[]) => {
    const sent = await sendMessage(text, files);
    if (sent) append(sent);
  };

  const sendGif = async (gif: GifItem) => {
    const sent = await sendMessage('', [], [{ kind: 'gif', url: gif.url, width: gif.width ?? undefined, height: gif.height ?? undefined }]);
    if (sent) append(sent);
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
      <Composer channelName={title} placeholder="Reply in thread…" onSend={send} tools={<ComposerTools channelId={channel.id} allowPoll={false} onGif={gif => void sendGif(gif)} />} />
    </aside>
  );
}
