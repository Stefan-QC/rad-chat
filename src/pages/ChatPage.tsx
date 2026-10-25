import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { MessageExtrasProvider } from '../app/MessageExtrasContext';
import { useNotifications } from '../app/NotificationsContext';
import { PinsProvider, usePins } from '../app/PinsContext';
import { useWorkspace } from '../app/WorkspaceContext';
import { ChannelMembersDialog } from '../components/chat/ChannelMembersDialog';
import { Composer } from '../components/chat/Composer';
import { ComposerTools } from '../components/chat/ComposerTools';
import { MessageList } from '../components/chat/MessageList';
import { PinnedPanel } from '../components/chat/PinnedPanel';
import { ThreadPanel } from '../components/chat/ThreadPanel';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import type { GifItem } from '../services/GifService';
import { useChannelPermissions } from '../hooks/useChannelPermissions';
import { useMessageSender } from '../hooks/useMessageSender';
import { useMessages } from '../hooks/useMessages';

function ChannelView({ channelId }: { channelId: string }) {
  const { me } = useAuth();
  const { channels, teams, presenter, channelMembers, profiles } = useWorkspace();
  const channel = channels.find(c => c.id === channelId)!;
  const { messages, hasMore, loadMore, append, error: loadError } = useMessages(channelId);
  const [params, setParams] = useSearchParams();
  const { send: sendMessage, error: sendError, setError } = useMessageSender(channelId);
  const [showMembers, setShowMembers] = useState(false);
  const title = presenter.title(channel);
  const memberCount = channelMembers.filter(m => m.channel_id === channelId).length;
  const team = teams.find(t => t.id === channel.team_id);
  const mentionables = useMemo(() => {
    const ids = new Set(channelMembers.filter(m => m.channel_id === channelId).map(m => m.user_id));
    const teamIds = new Set(team?.members.map(m => m.user_id));
    return profiles.filter(p => !p.deactivated_at && p.id !== me?.id && (channel.is_private ? ids.has(p.id) : team ? teamIds.has(p.id) : p.role !== 'guest'));
  }, [profiles, channelMembers, channelId, channel.is_private, team, me?.id]);
  const threadId = Number(params.get('thread')) || null;
  const pinsOpen = params.get('panel') === 'pins';
  const { canPost, postBlockedReason } = useChannelPermissions(channel);
  const { markChannelRead } = useNotifications();
  const lastMessageId = messages.at(-1)?.id ?? null;
  const { pins } = usePins();

  const openThread = useCallback((messageId: number) => setParams({ thread: String(messageId) }), [setParams]);
  const closeThread = useCallback(() => setParams({}), [setParams]);
  const togglePins = () => setParams(pinsOpen ? {} : { panel: 'pins' });

  // Zolang het kanaal zichtbaar is en je onderaan zit, tellen nieuwe berichten als gelezen.
  useEffect(() => {
    if (lastMessageId === null) return;
    const mark = () => { if (!document.hidden) markChannelRead(channelId, lastMessageId); };
    const timer = setTimeout(mark, 400);
    document.addEventListener('visibilitychange', mark);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', mark);
    };
  }, [channelId, lastMessageId, markChannelRead]);

  const send = async (text: string, files: File[]) => {
    const sent = await sendMessage(text, files);
    if (sent && sent.parent_id === null) append(sent);
  };

  const sendGif = async (gif: GifItem) => {
    const sent = await sendMessage('', [], [{ kind: 'gif', url: gif.url, width: gif.width ?? undefined, height: gif.height ?? undefined }]);
    if (sent && sent.parent_id === null) append(sent);
  };

  return (
    <div className="chat-layout">
      <div className="chat-main">
        <PageHeader
          title={title}
          prefix={presenter.isConversation(channel) ? <Icon name="user" size={20} /> : channel.is_private ? <Icon name="lock" size={18} /> : <span className="hash">#</span>}
          topic={team ? `${team.name} · ${channel.topic ?? ''}` : presenter.subtitle(channel)}
          actions={(
            <>
              <button className={`iconbtn${pinsOpen ? ' on' : ''}`} aria-label="Pinned messages" aria-pressed={pinsOpen} title="Pinned messages" onClick={togglePins}>
                <Icon name="pin" />{pins.length > 0 && <small className="count">{pins.length}</small>}
              </button>
              {channel.kind !== 'dm' && (
                <button className="iconbtn" aria-label="Channel members and settings" title="Members and settings" onClick={() => setShowMembers(true)}>
                  <Icon name="users" />{memberCount > 0 && <small className="count">{memberCount}</small>}
                </button>
              )}
            </>
          )}
        />
        {showMembers && <ChannelMembersDialog channel={channel} onClose={() => setShowMembers(false)} />}
        <MessageList title={title} channel={channel} messages={messages} hasMore={hasMore} onLoadMore={() => void loadMore()} onError={setError} onOpenThread={openThread} />
        {(sendError || loadError) && <div className="banner error" role="alert">{sendError || loadError}</div>}
        {canPost
          ? <Composer channelName={title} conversation={presenter.isConversation(channel)} onSend={send} mentionables={mentionables} tools={<ComposerTools channelId={channelId} onGif={gif => void sendGif(gif)} />} />
          : <div className="composer-blocked" role="note"><Icon name="lock" size={16} />{postBlockedReason}</div>}
      </div>
      {threadId !== null && <ThreadPanel key={threadId} channel={channel} rootId={threadId} title={title} onClose={closeThread} />}
      {threadId === null && pinsOpen && <PinnedPanel onClose={closeThread} />}
    </div>
  );
}

export function ChatPage() {
  const { channelId } = useParams();
  const { channels } = useWorkspace();
  const channel = channels.find(c => c.id === channelId);
  if (channels.length === 0) return <div className="page-loading">Loading…</div>;
  if (!channel || channel.kind === 'voice') return <Navigate to="/" replace />;
  return (
    <MessageExtrasProvider>
      <PinsProvider key={channel.id} channel={channel}>
        <ChannelView channelId={channel.id} />
      </PinsProvider>
    </MessageExtrasProvider>
  );
}
