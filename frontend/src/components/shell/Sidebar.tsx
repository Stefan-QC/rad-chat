import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useNotifications } from '../../app/NotificationsContext';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import type { Channel } from '../../core/types';
import { Avatar } from '../Avatar';
import { NewConversationDialog } from '../chat/NewConversationDialog';
import { Icon } from '../Icon';
import { useTasks } from '../../hooks/useTasks';
import { NotificationBell } from './NotificationBell';
import { UserBar } from './UserBar';
import { VoiceBar } from './VoiceBar';

/** Toont het aantal ongelezen vermeldingen, of een stip als er alleen ongelezen berichten zijn. */
function UnreadBadge({ channelId }: { channelId: string }) {
  const entry = useNotifications().unreadOf(channelId);
  if (!entry) return null;
  if (entry.mentions > 0) return <span className="unread-badge" aria-label={`${entry.mentions} unread mentions`}>{entry.mentions > 99 ? '99+' : entry.mentions}</span>;
  return entry.unread > 0 ? <span className="unread-dot" aria-label="Unread messages" /> : null;
}

function TextChannelLink({ channel }: { channel: Channel }) {
  const unread = (useNotifications().unreadOf(channel.id)?.unread ?? 0) > 0;
  return (
    <NavLink to={`/channels/${channel.id}`} className={({ isActive }) => `chan${isActive ? ' active' : ''}${unread ? ' has-unread' : ''}`}>
      {channel.is_private ? <Icon name="lock" className="chan-lock" /> : <span className="hash">#</span>}
      <span className="chan-name">{channel.name}</span>
      {channel.post_policy === 'moderators' && <span className="tag">announce</span>}
      <UnreadBadge channelId={channel.id} />
    </NavLink>
  );
}

function VoiceChannelRow({ channel }: { channel: Channel }) {
  const { voice } = useServices();
  const { voiceParticipants, voiceSelf, speaking, profileById } = useWorkspace();
  const people = voiceParticipants.get(channel.id) ?? [];
  const connected = voiceSelf.channelId === channel.id;
  return (
    <div className="voice">
      <button className={`chan${connected ? ' connected' : ''}`} onClick={() => void voice.join(channel.id)}>
        <Icon name="speaker" />
        {channel.name}
      </button>
      <ul className="voice-users">
        {people.map(person => {
          const profile = profileById(person.userId);
          if (!profile) return null;
          return (
            <li key={person.userId} className={speaking.has(person.userId) ? 'speaking' : ''}>
              <Avatar name={profile.display_name} color={profile.avatar_color} size="xs" speaking={speaking.has(person.userId)} />
              <span>{profile.display_name}</span>
              {person.sharing && <Icon name="screen" className="sharing-ic" />}
              {person.muted && <Icon name="mic-off" className="muted-ic" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChannelGroup({ title, channels, onAdd }: { title: string; channels: Channel[]; onAdd?: () => void }) {
  const text = channels.filter(c => c.kind === 'text');
  const voice = channels.filter(c => c.kind === 'voice');
  return (
    <>
      <div className="cat">
        <span>{title}</span>
        {onAdd && <button className="cat-add" aria-label={`Add to ${title}`} title="New private channel" onClick={onAdd}><Icon name="plus" size={14} /></button>}
      </div>
      {text.map(c => <TextChannelLink key={c.id} channel={c} />)}
      {voice.map(c => <VoiceChannelRow key={c.id} channel={c} />)}
    </>
  );
}

/** Zijbalk met kanalen per bedrijf en team, gesprekken, voice-deelnemers en snelkoppelingen. */
export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const { me } = useAuth();
  const { channels, myTeams, closeDrawer } = useWorkspace();
  const { tasks } = useTasks();
  const openTasks = tasks.filter(t => t.status === 'open' && t.assignee_id === me?.id).length;
  const [newChannel, setNewChannel] = useState(false);
  const company = channels.filter(c => c.team_id === null && !c.is_private && (c.kind === 'text' || c.kind === 'voice'));
  const companyPrivate = channels.filter(c => c.team_id === null && c.is_private && c.kind === 'text');

  return (
    <aside id="sidebar" onClick={closeDrawer}>
      <div className="side-head">
        <div><h2>RAD Chat</h2><span>Quality in IT</span></div>
        <NotificationBell />
      </div>
      <button className="side-search" onClick={onSearch} aria-label="Search and quick switcher">
        <Icon name="search" size={16} /><span>Search</span><kbd>Ctrl K</kbd>
      </button>
      <div className="side-body">
        <ChannelGroup title="Company" channels={company} onAdd={me?.role !== 'guest' ? () => setNewChannel(true) : undefined} />
        {companyPrivate.length > 0 && <ChannelGroup title="Private channels" channels={companyPrivate} />}
        {myTeams.map(team => (
          <ChannelGroup key={team.id} title={team.name} channels={channels.filter(c => c.team_id === team.id && (c.kind === 'text' || c.kind === 'voice'))} />
        ))}
        <div className="cat">Activities</div>
        <NavLink to="/wordle" className={({ isActive }) => `chan${isActive ? ' active' : ''}`}>
          <Icon name="grid" />RAD Wordle<span className="tag">/wordle</span>
        </NavLink>
        <NavLink to="/typerace" className={({ isActive }) => `chan${isActive ? ' active' : ''}`}>
          <Icon name="keyboard" />Type race
        </NavLink>
        <NavLink to="/quiz" className={({ isActive }) => `chan${isActive ? ' active' : ''}`}>
          <Icon name="bulb" />Daily quiz
        </NavLink>
        <NavLink to="/craft" className="chan">
          <Icon name="cube" />RAD Craft<span className="tag">/game</span>
        </NavLink>
        <div className="cat">Workspace</div>
        <NavLink to="/tasks" className={({ isActive }) => `chan${isActive ? ' active' : ''}`}><Icon name="check" />Tasks{openTasks > 0 && <span className="unread-badge">{openTasks}</span>}</NavLink>
        <NavLink to="/knowledge" className={({ isActive }) => `chan${isActive ? ' active' : ''}`}><Icon name="book" />Knowledge base</NavLink>
        <NavLink to="/meetings" className={({ isActive }) => `chan${isActive ? ' active' : ''}`}><Icon name="notes" />Meetings</NavLink>
        <NavLink to="/people" className={({ isActive }) => `chan${isActive ? ' active' : ''}`}><Icon name="calendar" />Who is where</NavLink>
        <NavLink to="/teams" className={({ isActive }) => `chan${isActive ? ' active' : ''}`}><Icon name="users" />Teams</NavLink>
        <NavLink to="/kudos" className={({ isActive }) => `chan${isActive ? ' active' : ''}`}><Icon name="star" />Kudos</NavLink>
        <NavLink to="/leaderboard" className={({ isActive }) => `chan${isActive ? ' active' : ''}`}><Icon name="trophy" />Leaderboard</NavLink>
      </div>
      <VoiceBar />
      <UserBar />
      {newChannel && <NewConversationDialog initialTab="channel" onClose={() => setNewChannel(false)} />}
    </aside>
  );
}
