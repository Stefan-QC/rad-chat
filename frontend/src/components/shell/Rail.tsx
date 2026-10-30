import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useNotifications } from '../../app/NotificationsContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import type { Channel } from '../../core/types';
import { Avatar } from '../Avatar';
import { NewConversationDialog } from '../chat/NewConversationDialog';
import { Icon } from '../Icon';

/** Eén gesprek als ronde knop: het gezicht van de ander (of de eerste letter van een groep) met een teller voor vermeldingen. */
function ConversationButton({ channel }: { channel: Channel }) {
  const { presenter, onlineIds } = useWorkspace();
  const entry = useNotifications().unreadOf(channel.id);
  const first = presenter.others(channel)[0];
  const title = presenter.title(channel);
  const mentions = entry?.mentions ?? 0;
  const unread = mentions > 0 || (entry?.unread ?? 0) > 0;
  return (
    <NavLink
      to={`/channels/${channel.id}`}
      className={({ isActive }) => `rail-btn rail-dm${isActive ? ' active' : ''}${unread ? ' has-unread' : ''}`}
      title={title}
      aria-label={`${title}${mentions > 0 ? `, ${mentions} unread mentions` : ''}`}
    >
      {channel.kind === 'dm' && first
        ? <Avatar name={first.display_name} color={first.avatar_color} size="md" online={onlineIds.has(first.id)} />
        : <span className="rail-group" aria-hidden="true">{[...title][0]?.toUpperCase() ?? '#'}</span>}
      {mentions > 0 && <span className="rail-badge">{mentions > 99 ? '99+' : mentions}</span>}
    </NavLink>
  );
}

/** Smalle zwarte balk uiterst links: thuis, je gesprekken met collega's en de instellingen. */
export function Rail() {
  const { me } = useAuth();
  const { channels } = useWorkspace();
  const [newMessage, setNewMessage] = useState(false);
  const conversations = channels
    .filter(channel => channel.kind === 'dm' || channel.kind === 'group')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <nav id="rail" aria-label="Home and conversations">
      <NavLink to="/" end className="rail-btn home" data-tip="RAD Chat" aria-label="RAD Chat">
        <Icon name="logo" />
      </NavLink>
      <span className="rail-sep" />
      {me?.role !== 'guest' && (
        <button className="rail-btn rail-add" data-tip="New message or group chat" aria-label="New message or group chat" onClick={() => setNewMessage(true)}>
          <Icon name="plus" />
        </button>
      )}
      <div className="rail-dms">
        {conversations.map(channel => <ConversationButton key={channel.id} channel={channel} />)}
      </div>
      <NavLink to="/settings" className={({ isActive }) => `rail-btn rail-settings${isActive ? ' active' : ''}`} data-tip="Settings" aria-label="Settings">
        <Icon name="gear" />
      </NavLink>
      {newMessage && <NewConversationDialog initialTab="message" showTabs={false} onClose={() => setNewMessage(false)} />}
    </nav>
  );
}
