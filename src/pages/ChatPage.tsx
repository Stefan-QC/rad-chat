import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { useWorkspace } from '../app/WorkspaceContext';
import { Composer } from '../components/chat/Composer';
import { MessageList } from '../components/chat/MessageList';
import { PageHeader } from '../components/PageHeader';
import { messageOf } from '../core/AppError';
import { useMessages } from '../hooks/useMessages';

function ChannelView({ channelId }: { channelId: string }) {
  const { messages: service } = useServices();
  const { me } = useAuth();
  const { channels, teams } = useWorkspace();
  const channel = channels.find(c => c.id === channelId)!;
  const { messages, hasMore, loadMore, append, error: loadError } = useMessages(channelId);
  const [error, setError] = useState<string | null>(null);
  const team = teams.find(t => t.id === channel.team_id);

  useEffect(() => {
    document.title = `#${channel.name} · RAD Chat`;
    return () => { document.title = 'RAD Chat'; };
  }, [channel.name]);

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
      <PageHeader title={channel.name} prefix={<span className="hash">#</span>} topic={team ? `${team.name} · ${channel.topic ?? ''}` : channel.topic} />
      <MessageList channel={channel} messages={messages} hasMore={hasMore} onLoadMore={() => void loadMore()} onError={setError} />
      {(error || loadError) && <div className="banner error" role="alert">{error || loadError}</div>}
      <Composer channelName={channel.name} onSend={send} />
    </>
  );
}

export function ChatPage() {
  const { channelId } = useParams();
  const { channels } = useWorkspace();
  const channel = channels.find(c => c.id === channelId);
  if (channels.length === 0) return <div className="page-loading">Loading…</div>;
  if (!channel || channel.kind !== 'text') return <Navigate to="/" replace />;
  return <ChannelView key={channel.id} channelId={channel.id} />;
}
