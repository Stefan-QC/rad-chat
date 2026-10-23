import { NavLink } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import type { Channel } from '../../core/types';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { UserBar } from './UserBar';
import { VoiceBar } from './VoiceBar';

function TextChannelLink({ channel }: { channel: Channel }) {
  return (
    <NavLink to={`/channels/${channel.id}`} className={({ isActive }) => `chan${isActive ? ' active' : ''}`}>
      <span className="hash">#</span>
      {channel.name}
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
              {person.muted && <Icon name="mic-off" className="muted-ic" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChannelGroup({ title, channels }: { title: string; channels: Channel[] }) {
  const text = channels.filter(c => c.kind === 'text');
  const voice = channels.filter(c => c.kind === 'voice');
  return (
    <>
      <div className="cat">{title}</div>
      {text.map(c => <TextChannelLink key={c.id} channel={c} />)}
      {voice.map(c => <VoiceChannelRow key={c.id} channel={c} />)}
    </>
  );
}

/** Zijbalk met kanalen per bedrijf en team, voice-deelnemers en snelkoppelingen. */
export function Sidebar() {
  const { me } = useAuth();
  const { channels, myTeams, closeDrawer } = useWorkspace();
  const company = channels.filter(c => c.team_id === null);
  return (
    <aside id="sidebar" onClick={closeDrawer}>
      <div className="side-head"><h2>RAD Chat</h2><span>Quality in IT</span></div>
      <div className="side-body">
        <ChannelGroup title="Company" channels={company} />
        {myTeams.map(team => (
          <ChannelGroup key={team.id} title={team.name} channels={channels.filter(c => c.team_id === team.id)} />
        ))}
        <div className="cat">Activities</div>
        <NavLink to="/wordle" className={({ isActive }) => `chan${isActive ? ' active' : ''}`}>
          <Icon name="grid" />RAD Wordle<span className="tag">/wordle</span>
        </NavLink>
        <NavLink to="/craft" className="chan">
          <Icon name="cube" />RAD Craft<span className="tag">/game</span>
        </NavLink>
        <div className="cat">Workspace</div>
        <NavLink to="/teams" className={({ isActive }) => `chan${isActive ? ' active' : ''}`}><Icon name="users" />Teams</NavLink>
        <NavLink to="/leaderboard" className={({ isActive }) => `chan${isActive ? ' active' : ''}`}><Icon name="trophy" />Leaderboard</NavLink>
        {me?.role === 'admin' && (
          <NavLink to="/admin" className={({ isActive }) => `chan${isActive ? ' active' : ''}`}><Icon name="shield" />Admin</NavLink>
        )}
      </div>
      <VoiceBar />
      <UserBar />
    </aside>
  );
}
