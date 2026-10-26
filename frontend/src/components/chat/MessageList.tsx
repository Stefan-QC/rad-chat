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
/** Zolang loopt de vloeiende scroll naar een nieuw bericht; daarin laten we de groeiende inhoud met rust. */
const SMOOTH_SCROLL_MS = 500;

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
  const feed = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const settled = useRef(false);
  const previousHeight = useRef(0);
  const smoothUntil = useRef(0);

  // Een ander kanaal begint weer onderaan; dit moet vóór het plaatsen van de berichten gebeuren.
  useLayoutEffect(() => {
    stick.current = true;
    settled.current = false;
    previousHeight.current = 0;
  }, [channel.id]);

  // De eerste berichten staan meteen onderaan; daarna schuiven nieuwe berichten vloeiend in beeld.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (messages.length > 0) {
      if (!settled.current) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
        settled.current = true;
      } else if (!stick.current && el.scrollHeight > previousHeight.current && el.scrollTop === 0) {
        // Oudere berichten laden: de leespositie meteen vasthouden, zonder animatie.
        el.scrollTo({ top: el.scrollHeight - previousHeight.current, behavior: 'instant' });
      } else if (stick.current) {
        smoothUntil.current = Date.now() + SMOOTH_SCROLL_MS;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    }
    previousHeight.current = el.scrollHeight;
  }, [messages]);

  // Afbeeldingen, polls en reacties krijgen pas later hun hoogte: blijf onderaan zolang je niet zelf omhoog scrolde.
  useEffect(() => {
    const el = box.current;
    const content = feed.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(() => {
      if (stick.current && settled.current && Date.now() > smoothUntil.current) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

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
      <div className="feed" ref={feed}>
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
    </div>
  );
}
