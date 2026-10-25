import { StatusPresenter } from '../core/presence';
import type { PresenceStatus } from '../core/types';

interface AvatarProps {
  name: string;
  color: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  online?: boolean;
  /** De status bepaalt de kleur van de stip; zonder status is de stip groen. */
  status?: PresenceStatus;
  speaking?: boolean;
}

/** Rond profielicoon met initiaal; optioneel met statusstip of spreekring. */
export function Avatar({ name, color, size = 'md', online, status, speaking }: AvatarProps) {
  const initial = [...name][0] ?? '?';
  return (
    <div className={`av ${size}${speaking ? ' speaking' : ''}`} style={{ backgroundColor: color }} title={name}>
      {initial}
      {online !== undefined && <span className={`dot${online ? '' : ' off'}`} style={online && status ? { background: StatusPresenter.color(status) } : undefined} />}
    </div>
  );
}
