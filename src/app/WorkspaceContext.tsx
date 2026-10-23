import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Channel, Profile, TeamWithMembers } from '../core/types';
import type { VoiceParticipant, VoiceSelf } from '../services/voice/VoiceHub';
import { useMe } from './AuthContext';
import { useServices } from './ServicesContext';

interface WorkspaceValue {
  channels: Channel[];
  teams: TeamWithMembers[];
  myTeams: TeamWithMembers[];
  profiles: Profile[];
  profileById: (id: string | null | undefined) => Profile | undefined;
  onlineIds: Set<string>;
  voiceParticipants: Map<string, VoiceParticipant[]>;
  voiceSelf: VoiceSelf;
  speaking: Set<string>;
  drawerOpen: boolean;
  toggleDrawer: () => void;
  closeDrawer: () => void;
  refreshTeams: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/** Laadt en synchroniseert alles wat de hele werkruimte nodig heeft: kanalen, teams, profielen, aanwezigheid en voice. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { channels: channelService, teams: teamService, profiles: profileService, lobby, voice } = useServices();
  const me = useMe();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [voiceParticipants, setVoiceParticipants] = useState<Map<string, VoiceParticipant[]>>(new Map());
  const [voiceSelf, setVoiceSelf] = useState<VoiceSelf>({ channelId: null, muted: false, error: null });
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refreshChannels = useCallback(async () => setChannels(await channelService.list()), [channelService]);
  const refreshTeams = useCallback(async () => setTeams(await teamService.list()), [teamService]);
  const refreshProfiles = useCallback(async () => setProfiles(await profileService.listAll()), [profileService]);

  useEffect(() => {
    void refreshChannels();
    void refreshTeams();
    void refreshProfiles();
    const stops = [
      channelService.watch(() => void refreshChannels()),
      teamService.watch(() => void refreshTeams()),
      profileService.watch(() => void refreshProfiles()),
      lobby.on('change', ids => setOnlineIds(new Set(ids))),
      voice.on('participants', setVoiceParticipants),
      voice.on('self', setVoiceSelf),
      voice.on('speaking', setSpeaking),
    ];
    lobby.join(me.id);
    return () => {
      stops.forEach(stop => stop());
      lobby.leave();
    };
  }, [me.id, channelService, teamService, profileService, lobby, voice, refreshChannels, refreshTeams, refreshProfiles]);

  const voiceChannelKey = channels.filter(c => c.kind === 'voice').map(c => c.id).sort().join(',');
  useEffect(() => {
    voice.watch(me.id, voiceChannelKey ? voiceChannelKey.split(',') : []);
  }, [voice, me.id, voiceChannelKey]);

  const profileById = useCallback((id: string | null | undefined) => profiles.find(p => p.id === id), [profiles]);
  const myTeams = useMemo(() => teams.filter(t => t.members.some(m => m.user_id === me.id)), [teams, me.id]);
  const toggleDrawer = useCallback(() => setDrawerOpen(open => !open), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const value = useMemo(
    () => ({
      channels, teams, myTeams, profiles, profileById, onlineIds, voiceParticipants, voiceSelf, speaking,
      drawerOpen, toggleDrawer, closeDrawer, refreshTeams,
    }),
    [channels, teams, myTeams, profiles, profileById, onlineIds, voiceParticipants, voiceSelf, speaking, drawerOpen, toggleDrawer, closeDrawer, refreshTeams],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
