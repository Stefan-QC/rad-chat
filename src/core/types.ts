export type Role = 'member' | 'admin' | 'guest';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  job_title: string | null;
  bio: string | null;
  avatar_color: string;
  role: Role;
  expires_at: string | null;
  deactivated_at: string | null;
  created_at: string;
}

export type ProfilePatch = Pick<Profile, 'display_name' | 'job_title' | 'bio' | 'avatar_color'>;

export type ChannelKind = 'text' | 'voice' | 'dm' | 'group';
export type ChannelRole = 'owner' | 'moderator' | 'member' | 'readonly';
export type PostPolicy = 'everyone' | 'moderators';

export interface Channel {
  id: string;
  name: string;
  kind: ChannelKind;
  team_id: string | null;
  topic: string | null;
  is_private: boolean;
  post_policy: PostPolicy;
  created_by: string | null;
  created_at: string;
}

export interface ChannelMember {
  channel_id: string;
  user_id: string;
  role: ChannelRole;
  joined_at: string;
}

export interface Message {
  id: number;
  channel_id: string;
  user_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  parent_id: number | null;
  kind: 'text' | 'poll' | 'system';
  reply_count: number;
  last_reply_at: string | null;
  attachment_count: number;
}

export interface Reaction {
  message_id: number;
  user_id: string;
  emoji: string;
}

export interface Attachment {
  id: string;
  message_id: number;
  kind: 'image' | 'gif';
  storage_path: string | null;
  url: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
}

export interface PinnedMessage {
  message_id: number;
  channel_id: string;
  pinned_by: string | null;
  pinned_at: string;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_by: string | null;
  created_at: string;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  role: 'owner' | 'moderator' | 'member';
  joined_at: string;
}

export type TeamRole = TeamMember['role'];

export interface TeamWithMembers extends Team {
  members: TeamMember[];
}

export interface UserScore {
  user_id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  points: number;
  wordle_points: number;
  craft_points: number;
}

export interface TeamScore {
  team_id: string;
  name: string;
  color: string;
  members: number;
  points: number;
}

export type LetterMark = 'correct' | 'present' | 'absent';

export interface WordleGuess {
  word: string;
  marks: LetterMark[];
}

export type WordleStatus = 'playing' | 'won' | 'lost';

export interface WordleState {
  day: string;
  status: WordleStatus;
  points: number;
  guesses: WordleGuess[];
  answer: string | null;
}

export interface WordleStats {
  played: number;
  wins: number;
  streak: number;
  max: number;
  dist: number[];
}

export interface AuditEntry {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type ActivityKind = 'voice' | 'craft' | 'wordle';

export interface ActivitySession {
  id: number;
  user_id: string;
  kind: ActivityKind;
  ref: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface CraftWorld {
  seed: number;
  size: number;
  height: number;
  edits: Record<string, number>;
}

export interface UserSettings {
  user_id: string;
  theme: 'system' | 'light' | 'dark';
  notify_mentions: boolean;
  notify_messages: boolean;
  notify_sound: boolean;
  notify_browser: boolean;
  compact_mode: boolean;
}

export type UserSettingsPatch = Partial<Omit<UserSettings, 'user_id'>>;

export interface AppNotification {
  id: number;
  user_id: string;
  kind: 'mention' | 'reply' | 'dm' | 'task' | 'kudos' | 'poll' | 'coffee' | 'system';
  actor_id: string | null;
  channel_id: string | null;
  message_id: number | null;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface UnreadEntry {
  channel_id: string;
  unread: number;
  mentions: number;
}
