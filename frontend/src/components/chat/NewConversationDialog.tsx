import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { messageOf } from '../../core/AppError';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { PeoplePicker } from './PeoplePicker';

type Tab = 'message' | 'channel';

interface NewConversationDialogProps {
  initialTab?: Tab;
  onClose: () => void;
}

/** Dialoog om een direct bericht, een groep of een privékanaal te starten. */
export function NewConversationDialog({ initialTab = 'message', onClose }: NewConversationDialogProps) {
  const { channels: service } = useServices();
  const { me } = useAuth();
  const { profiles, myTeams, refreshChannels } = useWorkspace();
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [channelName, setChannelName] = useState('');
  const [topic, setTopic] = useState('');
  const [teamId, setTeamId] = useState('');
  const [busy, setBusy] = useState(false);

  const candidates = profiles.filter(p => p.id !== me?.id && !p.deactivated_at && (p.role !== 'guest' || me?.role === 'admin'));

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      const id = await action();
      await refreshChannels();
      onClose();
      navigate(`/channels/${id}`);
    } catch (error) {
      toast.error(messageOf(error));
      setBusy(false);
    }
  };

  const startMessage = () => run(() => (selected.length === 1
    ? service.startDirectMessage(selected[0])
    : service.createGroup(groupName.trim() || 'Group', selected)));

  const createChannel = () => run(() => service.createPrivateChannel({ name: channelName, topic: topic || undefined, teamId: teamId || null, memberIds: selected }));

  return (
    <Modal title="New conversation" onClose={onClose} width={560}>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'message'} className={tab === 'message' ? 'on' : ''} onClick={() => { setTab('message'); setSelected([]); }}>Message</button>
        <button role="tab" aria-selected={tab === 'channel'} className={tab === 'channel' ? 'on' : ''} onClick={() => { setTab('channel'); setSelected([]); }}>Private channel</button>
      </div>

      {tab === 'channel' && (
        <div className="form dialog-form">
          <label>Channel name
            <input className="text-input" value={channelName} maxLength={40} placeholder="e.g. project-apollo" onChange={event => setChannelName(event.target.value)} />
          </label>
          <label>Topic (optional)
            <input className="text-input" value={topic} maxLength={200} onChange={event => setTopic(event.target.value)} />
          </label>
          {myTeams.length > 0 && (
            <label>Team (optional)
              <select className="text-input" value={teamId} onChange={event => setTeamId(event.target.value)}>
                <option value="">No team, company wide</option>
                {myTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="dialog-section">
        <span className="label">{tab === 'message' ? 'Who do you want to talk to?' : 'Add people (optional)'}</span>
        <PeoplePicker people={candidates} selected={selected} onChange={setSelected} />
      </div>

      {tab === 'message' && selected.length > 1 && (
        <label className="form dialog-form">Group name
          <input className="text-input" value={groupName} maxLength={40} placeholder="e.g. Release crew" onChange={event => setGroupName(event.target.value)} />
        </label>
      )}

      <div className="actions">
        <button className="btn secondary" onClick={onClose}>Cancel</button>
        {tab === 'message' ? (
          <button className="btn" disabled={busy || selected.length === 0} onClick={() => void startMessage()}>
            {selected.length > 1 ? 'Create group' : 'Start conversation'}
          </button>
        ) : (
          <button className="btn" disabled={busy || channelName.trim().length < 1} onClick={() => void createChannel()}>Create channel</button>
        )}
      </div>
    </Modal>
  );
}
