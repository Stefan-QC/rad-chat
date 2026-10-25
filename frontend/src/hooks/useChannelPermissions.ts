import { useMemo } from 'react';
import { useAuth } from '../app/AuthContext';
import { useWorkspace } from '../app/WorkspaceContext';
import type { Channel } from '../core/types';

export interface ChannelPermissions {
  canModerate: boolean;
  isOwner: boolean;
  canPost: boolean;
  /** Waarom er niet gepost kan worden, voor de melding onder het kanaal. */
  postBlockedReason: string | null;
}

/** Spiegelt de regels van de database om knoppen te tonen of te verbergen; de server blijft beslissen. */
export function useChannelPermissions(channel: Channel): ChannelPermissions {
  const { me } = useAuth();
  const { presenter, teams } = useWorkspace();
  return useMemo(() => {
    const isAdmin = me?.role === 'admin';
    const channelRole = presenter.roleOf(channel, me?.id ?? '');
    const teamRole = channel.team_id ? teams.find(t => t.id === channel.team_id)?.members.find(m => m.user_id === me?.id)?.role : undefined;
    const canModerate = isAdmin || channelRole === 'owner' || channelRole === 'moderator' || teamRole === 'owner' || teamRole === 'moderator';
    const isOwner = isAdmin || channelRole === 'owner';
    let postBlockedReason: string | null = null;
    if (channelRole === 'readonly') postBlockedReason = 'You have read-only access to this channel.';
    else if (channel.post_policy === 'moderators' && !canModerate) postBlockedReason = 'Only moderators can post in this channel.';
    return { canModerate, isOwner, canPost: postBlockedReason === null, postBlockedReason };
  }, [channel, me, presenter, teams]);
}
