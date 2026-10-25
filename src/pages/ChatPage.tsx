import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { useWorkspace } from '../app/WorkspaceContext';
import { Composer } from '../components/chat/Composer';
import { MessageList } from '../components/chat/MessageList';
import { ChannelMembersDialog } from '../components/chat/ChannelMembersDialog';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { messageOf } from '../core/AppError';
import { useMessages } from '../hooks/useMessages';

function ChannelView({ channelId }: { channelId: string }) {
  const { messages: service } = useServices();
  const { me } = useAuth();
  const { channels, teams, presenter, channelMembers } = useWorkspace();
  const channel = channels.find(c => c.id === channelId)!;
  const { messages, hasMore, loadMore, append, error: loadError } = useMessages(channelId);
  const [error, setError] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const title = presenter.title(channel);
  const memberCount = channelMembers.filter(m => m.channel_id === channelId).length;
  const team = teams.find(t => t.id === channel.team_id);

  useEffect(() => {
    document.title = `${title} · RAD Chat`;
    return () => { document.title = 'RAD Chat'; };
  }, [title]);

  const send = async (text: string) => {
    try {
      setError(null);
      append(await service.send(channelId, me!.id, text));
    } catch (e) {
      setError(messageOf(e));
    }
  };

  return (
    <>
      <PageHeader
        title={title}
        prefix={presenter.isConversation(channel) ? <Icon name="user" size={20} /> : channel.is_private ? <Icon name="lock" size={18} /> : <span className="hash">#</span>}
        topic={team ? `${team.name} · ${channel.topic ?? ''}` : presenter.subtitle(channel)}
        actions={channel.kind !== 'dm' && (
          <button className="iconbtn" aria-label="Channel members and settings" title="Members and settings" onClick={() => setShowMembers(true)}>
            <Icon name="users" />{memberCount > 0 && <small className="count">{memberCount}</small>}
          </button>
        )}
      />
      {showMembers && <ChannelMembersDialog channel={channel} onClose={() => setShowMembers(false)} />}
      <MessageList title={title} channel={channel} messages={messages} hasMore={hasMore} onLoadMore={() => void loadMore()} onError={setError} />
      {(error || loadError) && <div className="banner error" role="alert">{error || loadError}</div>}
      <Composer channelName={title} conversation={presenter.isConversation(channel)} onSend={send} />
    </>
  );
}

export function ChatPage() {
  const { channelId } = useParams();
  const { channels } = useWorkspace();
  const channel = channels.find(c => c.id === channelId);
  if (channels.length === 0) return <div className="page-loading">Loading…</div>;
  if (!channel || channel.kind === 'voice') return <Navigate to="/" replace />;
  return <ChannelView key={channel.id} channelId={channel.id} />;
}
