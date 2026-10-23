import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { Icon } from '../Icon';

/** Toont de voice-status met knoppen om te dempen of te verbreken, en eventuele microfoonfouten. */
export function VoiceBar() {
  const { voice } = useServices();
  const { voiceSelf, channels } = useWorkspace();
  const channel = channels.find(c => c.id === voiceSelf.channelId);
  if (!channel && !voiceSelf.error) return null;
  return (
    <div className="voice-bar">
      {channel ? (
        <>
          <div className="vb-info"><b>Voice connected</b><small>{channel.name}</small></div>
          <button className={`iconbtn${voiceSelf.muted ? ' on' : ''}`} id="voiceMute" title="Mute" aria-label="Mute microphone" aria-pressed={voiceSelf.muted} onClick={() => void voice.toggleMute()}>
            <Icon name={voiceSelf.muted ? 'mic-off' : 'mic'} />
          </button>
          <button className="iconbtn" title="Disconnect" aria-label="Disconnect from voice" onClick={() => void voice.leave()}>
            <Icon name="phone-off" />
          </button>
        </>
      ) : (
        <div className="vb-info"><b className="vb-error">Voice unavailable</b><small>{voiceSelf.error}</small></div>
      )}
    </div>
  );
}
