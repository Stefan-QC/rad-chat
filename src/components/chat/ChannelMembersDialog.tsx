import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { messageOf } from '../../core/AppError';
import type { Channel, ChannelRole } from '../../core/types';
import { Avatar } from '../Avatar';
import { Modal } from '../ui/Modal';
import { Switch } from '../ui/Switch';
import { useToast } from '../ui/Toast';
import { PeoplePicker } from './PeoplePicker';

const ROLES: ChannelRole[] = ['owner', 'moderator', 'member', 'readonly'];

/** Ledenlijst en beheer van één kanaal: rollen, leden toevoegen of verwijderen, schrijfrechten en verlaten. */
export function ChannelMembersDialog({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const { channels: service } = useServices();
  const { me } = useAuth();
  const { channelMembers, profiles, profileById, presenter, refreshChannels } = useWorkspace();
  const navigate = useNavigate();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const members = channelMembers.filter(m => m.channel_id === channel.id);
  const myRole = presenter.roleOf(channel, me?.id ?? '');
  const isAdmin = me?.role === 'admin';
  const canModerate = isAdmin || myRole === 'owner' || myRole === 'moderator';
  const isOwner = isAdmin || myRole === 'owner';
  const conversation = presenter.isConversation(channel);
  const manageableMembers = channel.is_private && channel.kind !== 'dm';
  const candidates = profiles.filter(p => !p.deactivated_at && !members.some(m => m.user_id === p.id) && (p.role !== 'guest' || isAdmin));

  const run = async (action: () => Promise<void>, after?: () => void) => {
    try {
      await action();
      await refreshChannels();
      after?.();
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  const addPeople = () => run(async () => {
    for (const id of picked) await service.addMember(channel.id, id);
  }, () => { setPicked([]); setAdding(false); });

  return (
    <Modal title={conversation ? 'Conversation' : `#${channel.name}`} onClose={onClose} width={560}>
      {!channel.is_private && <p className="muted">This channel is visible to {channel.team_id ? 'everyone in the team' : 'all colleagues'}.</p>}

      {isOwner && channel.kind !== 'dm' && (
        <Switch label="Only moderators can post" description="Everyone can read, but only owners and moderators can write (handy for announcements)."
          checked={channel.post_policy === 'moderators'} onChange={checked => void run(() => service.setPostPolicy(channel.id, checked ? 'moderators' : 'everyone'))} />
      )}

      {members.length > 0 && (
        <>
          <h3 className="dialog-heading">Members — {members.length}</h3>
          <ul className="member-list roomy">
            {members.map(member => {
              const profile = profileById(member.user_id);
              if (!profile) return null;
              const self = member.user_id === me?.id;
              return (
                <li key={member.user_id}>
                  <Avatar name={profile.display_name} color={profile.avatar_color} size="sm" />
                  <span className="grow"><b>{profile.display_name}</b>{self && <small> you</small>}</span>
                  {isOwner && !self && channel.kind !== 'dm' ? (
                    <select className="text-input small" aria-label={`Role of ${profile.display_name}`} value={member.role}
                      onChange={event => void run(() => service.setMemberRole(channel.id, member.user_id, event.target.value as ChannelRole))}>
                      {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                    </select>
                  ) : <span className="badge">{member.role}</span>}
                  {manageableMembers && canModerate && !self && (
                    <button className="btn secondary small" onClick={() => void run(() => service.removeMember(channel.id, member.user_id))}>Remove</button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {manageableMembers && canModerate && (
        adding ? (
          <div className="dialog-section">
            <PeoplePicker people={candidates} selected={picked} onChange={setPicked} />
            <div className="actions">
              <button className="btn secondary" onClick={() => { setAdding(false); setPicked([]); }}>Cancel</button>
              <button className="btn" disabled={picked.length === 0} onClick={() => void addPeople()}>Add {picked.length || ''}</button>
            </div>
          </div>
        ) : <button className="btn secondary" onClick={() => setAdding(true)}>Add people</button>
      )}

      {manageableMembers && myRole && (
        <div className="actions left danger-zone">
          <button className="btn danger" onClick={() => window.confirm('Leave this conversation?') && void run(() => service.leave(channel.id), () => { onClose(); navigate('/'); })}>
            Leave
          </button>
        </div>
      )}
    </Modal>
  );
}
