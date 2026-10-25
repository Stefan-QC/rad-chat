import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../../app/WorkspaceContext';

function ScreenTile({ userId, stream, big, onToggle, onHide }: { userId: string; stream: MediaStream; big: boolean; onToggle: () => void; onHide: () => void }) {
  const { profileById } = useWorkspace();
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  const name = profileById(userId)?.display_name ?? 'Someone';
  return (
    <figure className="screen-tile" style={{ margin: 0 }}>
      <header>
        <span>{name} is sharing their screen</span>
        <button onClick={onToggle}>{big ? 'Smaller' : 'Full view'}</button>
        <button onClick={onHide} aria-label="Hide shared screens">Hide</button>
      </header>
      <video ref={video} autoPlay playsInline muted />
    </figure>
  );
}

/** Toont de schermen die collega's in jouw voicekanaal delen; staat los van de pagina waar je op zit. */
export function ScreenViewer() {
  const { screens } = useWorkspace();
  const [big, setBig] = useState(false);
  const [hidden, setHidden] = useState(false);
  const count = screens.size;

  // Zodra er een nieuw scherm bijkomt, verschijnt het venster weer, ook als je het eerder had verborgen.
  useEffect(() => {
    if (count > 0) setHidden(false);
    if (count === 0) setBig(false);
  }, [count]);

  if (count === 0 || hidden) return null;
  return (
    <aside className={`screen-viewer${big ? ' big' : ''}`} aria-label="Shared screens">
      {[...screens.entries()].map(([userId, stream]) => (
        <ScreenTile key={userId} userId={userId} stream={stream} big={big} onToggle={() => setBig(b => !b)} onHide={() => setHidden(true)} />
      ))}
    </aside>
  );
}
