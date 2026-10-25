import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { StatusPresenter } from '../../core/presence';
import { Avatar } from '../Avatar';

/** Ledenlijst rechts, gesplitst in online en offline collega's. */
export function MembersPanel() {
  const { me } = useAuth();
  const { profiles, onlineIds } = useWorkspace();
  const navigate = useNavigate();
  const online = profiles.filter(p => onlineIds.has(p.id));
  const offline = profiles.filter(p => !onlineIds.has(p.id));

  const renderList = (list: typeof profiles, isOnline: boolean) => (
    <ul className="users">
      {list.map(profile => (
        <li key={profile.id} className={isOnline ? '' : 'offline'} onClick={() => navigate(`/profile/${profile.id}`)}>
          <Avatar name={profile.display_name} color={profile.avatar_color} size="sm" online={isOnline} status={StatusPresenter.effective(profile)} />
          <span className="member-name">{profile.display_name}{isOnline && StatusPresenter.text(profile) && <small className="member-status">{StatusPresenter.text(profile)}</small>}</span>
          {profile.id === me?.id && <small>you</small>}
          {profile.role === 'admin' && <small className="badge">admin</small>}
        </li>
      ))}
    </ul>
  );

  return (
    <aside id="members">
      <h2>Online — {online.length}</h2>
      {renderList(online, true)}
      {offline.length > 0 && (
        <>
          <h2 className="offline-title">Offline — {offline.length}</h2>
          {renderList(offline, false)}
        </>
      )}
    </aside>
  );
}
