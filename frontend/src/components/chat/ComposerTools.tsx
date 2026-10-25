import { useState } from 'react';
import type { GifItem } from '../../services/GifService';
import { Icon } from '../Icon';
import { CreatePollDialog } from './CreatePollDialog';
import { GifButton } from './GifButton';

interface ComposerToolsProps {
  channelId: string;
  onGif: (gif: GifItem) => void;
  /** In een draadje past een peiling niet, dus daar wordt alleen de GIF-knop getoond. */
  allowPoll?: boolean;
}

/** De extra knoppen naast het invoerveld: een peiling maken en een GIF kiezen. */
export function ComposerTools({ channelId, onGif, allowPoll = true }: ComposerToolsProps) {
  const [polling, setPolling] = useState(false);
  return (
    <>
      {allowPoll && (
        <button type="button" className="tool-btn" aria-label="Create a poll" title="Poll" onClick={() => setPolling(true)}><Icon name="poll" size={22} /></button>
      )}
      <GifButton onPick={onGif} />
      {polling && <CreatePollDialog channelId={channelId} onClose={() => setPolling(false)} />}
    </>
  );
}
