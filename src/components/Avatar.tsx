interface AvatarProps {
  name: string;
  color: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  online?: boolean;
  speaking?: boolean;
}

/** Rond profielicoon met initiaal; optioneel met online-stip of spreekring. */
export function Avatar({ name, color, size = 'md', online, speaking }: AvatarProps) {
  const initial = [...name][0] ?? '?';
  return (
    <div className={`av ${size}${speaking ? ' speaking' : ''}`} style={{ backgroundColor: color }} title={name}>
      {initial}
      {online !== undefined && <span className={`dot${online ? '' : ' off'}`} />}
    </div>
  );
}
