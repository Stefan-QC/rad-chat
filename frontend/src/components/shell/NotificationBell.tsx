import { useEffect, useRef, useState } from 'react';
import { useNotifications } from '../../app/NotificationsContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { formatDateTime } from '../../core/format';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';

/** Belletje met teller; opent de inbox met alle meldingen. */
export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, open } = useNotifications();
  const { profileById } = useWorkspace();
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setVisible(false);
    const onClick = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setVisible(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [visible]);

  return (
    <div className="bell" ref={root} onClick={event => event.stopPropagation()}>
      <button className="iconbtn" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={visible} onClick={() => setVisible(v => !v)}>
        <Icon name="bell" size={20} />
        {unreadCount > 0 && <span className="bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {visible && (
        <div className="inbox" role="dialog" aria-label="Notifications">
          <header>
            <h3>Notifications</h3>
            <button className="link" disabled={unreadCount === 0} onClick={() => void markAllRead()}>Mark all read</button>
          </header>
          <ul>
            {notifications.length === 0 && <li className="empty">You are all caught up.</li>}
            {notifications.map(item => {
              const actor = profileById(item.actor_id);
              return (
                <li key={item.id}>
                  <button className={item.read_at ? '' : 'unread'} onClick={() => { setVisible(false); void open(item); }}>
                    <Avatar name={actor?.display_name ?? '!'} color={actor?.avatar_color ?? '#4a4a4a'} size="sm" />
                    <span>
                      <b>{item.title}</b>
                      {item.body && <small className="body">{item.body}</small>}
                      <small>{formatDateTime(item.created_at)}</small>
                    </span>
                    {!item.read_at && <i className="dot-unread" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
