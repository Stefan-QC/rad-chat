import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import type { Profile } from '../../core/types';
import type { StandingRow } from './standings';

interface RaceTracksProps {
  rows: StandingRow[];
  meId: string;
  profileById: (id: string) => Profile | undefined;
}

/** Eén horizontale racebaan per speler, met naam, WPM, nauwkeurigheid en voortgang; de koploper krijgt een trofee. */
export function RaceTracks({ rows, meId, profileById }: RaceTracksProps) {
  const leaderId = rows[0] && rows[0].progress > 0 ? rows[0].userId : null;
  return (
    <ol className="tr-tracks" aria-label="Race progress">
      {rows.map((row, index) => {
        const profile = profileById(row.userId);
        const name = profile?.display_name ?? 'Player';
        return (
          <li key={row.userId} className={`tr-track${row.userId === meId ? ' me' : ''}${row.userId === leaderId ? ' leader' : ''}${row.finished ? ' done' : ''}`}>
            <span className="tr-place">{row.userId === leaderId ? <Icon name="trophy" size={14} /> : index + 1}</span>
            <span className="tr-name" title={name}>{name}{row.userId === meId && <small>you</small>}</span>
            <span className="tr-lane">
              <span className="tr-fill" style={{ width: `${row.progress}%` }} />
              <span className="tr-runner" style={{ left: `${row.progress}%` }}>
                <Avatar name={name} color={profile?.avatar_color ?? '#4a4a4a'} size="xs" />
              </span>
            </span>
            <span className="tr-num" title="Words per minute">{Math.round(row.wpm)}<small>wpm</small></span>
            <span className="tr-num" title="Accuracy">{Math.round(row.accuracy)}<small>%</small></span>
            <span className="tr-num tr-pct" title="Progress">{Math.floor(row.progress)}<small>%</small></span>
          </li>
        );
      })}
    </ol>
  );
}
