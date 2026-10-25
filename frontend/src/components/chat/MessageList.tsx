import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useMessageExtras } from '../../app/MessageExtrasContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { dayKey, formatDay, formatTime } from '../../core/format';
import type { Channel, Message } from '../../core/types';
import { Avatar } from '../Avatar';
import { MessageItem } from './MessageItem';

interface MessageListProps {
  title: string;
  channel: Channel;
  messages: Message[];
  hasMore: boolean;
  onLoadMore: () => void;
  onError: (message: string) => void;
  onOpenThread?: (messageId: number) => void;
  showWelcome?: boolean;
}

interface Group {
  key: string;
  userId: string;
  startedAt: string;
  items: Message[];
  newDay: boolean;
}

const GROUP_WINDOW_MS = 5 * 60_000;

/** Voegt opeenvolgende berichten van dezelfde persoon samen tot één groep. */
function groupMessages(messages: Message[]): Group[] {
  const groups: Group[] = [];
  for (const message of messages) {
    const last = groups.at(-1);
    const lastMessage = last?.items.at(-1);
    const sameDay = lastMessage ? dayKey(lastMessage.created_at) === dayKey(message.created_at) : false;
    const close = lastMessage ? new Date(message.created_at).getTime() - new Date(lastMessage.created_at).getTime() < GROUP_WINDOW_MS : false;
    if (last && lastMessage && sameDay && close && last.userId === message.user_id) {
      last.items.push(message);
    } else {
      groups.push({ key: String(message.id), userId: message.user_id, startedAt: message.created_at, items: [message], newDay: !sameDay });
    }
  }
  return groups;
}

export function MessageList({ title, channel, messages, hasMore, onLoadMore, onError, onOpenThread, showWelcome = true }: MessageListProps) {
  const { me } = useAuth();
  const { profileById } = useWorkspace();
  const { ensure } = useMessageExtras();
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const previousHeight = useRef(0);

  // Blijf onderaan plakken bij nieuwe berichten, behalve als iemand omhoog scrolde.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const channelWasOpen = previousHeight.current > 0;
    if (channelWasOpen && !stick.current && el.scrollHeight > previousHeight.current && el.scrollTop === 0) {
      // Oudere berichten laden: de leespositie meteen vasthouden, zonder animatie.
      el.scrollTo({ top: el.scrollHeight - previousHeight.current, behavior: 'auto' });
    } else if (stick.current) {
      // Nieuw bericht: vloeiend naar onderen; bij het openen van een kanaal direct naar de laatste berichten.
      el.scrollTo({ top: el.scrollHeight, behavior: channelWasOpen ? 'smooth' : 'auto' });
    }
    previousHeight.current = el.scrollHeight;
  }, [messages]);

  useLayoutEffect(() => {
    stick.current = true;
    previousHeight.current = 0;
  }, [channel.id]);

  useEffect(() => ensure(messages), [messages, ensure]);

  const groups = groupMessages(messages);

  return (
    <div
      id="messages"
      ref={box}
      onScroll={event => {
        const el = event.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      {hasMore ? (
        <button className="load-more" onClick={onLoadMore}>Load older messages</button>
      ) : showWelcome && (
        <div className="welcome">
          <div className="big">{channel.kind === 'dm' || channel.kind === 'group' ? '@' : '#'}</div>
          <h3>{channel.kind === 'dm' ? `Your conversation with ${title}` : `Welcome to ${channel.kind === 'group' ? '' : '#'}${title}`}</h3>
          <p>{channel.topic || (channel.kind === 'dm' ? 'This is the start of your direct messages.' : 'This is the start of the channel. Say hi!')}</p>
        </div>
      )}
      {groups.map(group => {
        const author = profileById(group.userId);
        return (
          <Fragment key={group.key}>
            {group.newDay && <div className="day">{formatDay(group.startedAt)}</div>}
            <div className="grp">
              <Avatar name={author?.display_name ?? '?'} color={author?.avatar_color ?? '#4a4a4a'} />
              <div className="body">
                <div className="meta">
                  <b style={group.userId === me?.id ? { color: 'var(--red)' } : undefined}>{author?.display_name ?? 'Unknown user'}</b>
                  <time>{formatTime(group.startedAt)}</time>
                </div>
                {group.items.map(message => (
                  <MessageItem key={message.id} message={message} myUsername={me?.username ?? ''} onError={onError} onOpenThread={onOpenThread} />
                ))}
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
