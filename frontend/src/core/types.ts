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
  status: PresenceStatus;
  status_text: string | null;
  status_emoji: string | null;
  status_until: string | null;
  birth_month: number | null;
  birth_day: number | null;
  start_date: string | null;
  coffee_opt_in: boolean;
  created_at: string;
}

export type ProfilePatch = Pick<Profile, 'display_name' | 'job_title' | 'bio' | 'avatar_color'> &
  Partial<Pick<Profile, 'birth_month' | 'birth_day' | 'start_date' | 'coffee_opt_in'>>;

export type PresenceStatus = 'available' | 'busy' | 'meeting' | 'away' | 'dnd';

export interface StatusPatch {
  status: PresenceStatus;
  status_text: string | null;
  status_emoji: string | null;
  status_until: string | null;
}

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

export type WorkLocation = 'office' | 'home' | 'off' | 'travel';

export interface WorkPlan {
  user_id: string;
  day: string;
  location: WorkLocation;
}

export interface OnCallShift {
  id: number;
  team_id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
  created_by: string | null;
}

export interface Celebration {
  user_id: string;
  kind: 'birthday' | 'anniversary';
  on_date: string;
  years: number | null;
}

export interface Poll {
  id: number;
  message_id: number;
  channel_id: string;
  question: string;
  multiple: boolean;
  closes_at: string | null;
  created_by: string | null;
}

export interface PollOption {
  id: number;
  poll_id: number;
  label: string;
  position: number;
}

export interface PollVote {
  poll_id: number;
  option_id: number;
  user_id: string;
}

export interface PollData {
  poll: Poll;
  options: PollOption[];
  votes: PollVote[];
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  team_id: string | null;
  channel_id: string | null;
  message_id: number | null;
  meeting_id: number | null;
  assignee_id: string | null;
  created_by: string | null;
  due_date: string | null;
  status: 'open' | 'done';
  created_at: string;
  completed_at: string | null;
}

export interface KbPage {
  id: number;
  team_id: string | null;
  title: string;
  body: string;
  category: string | null;
  pinned: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KbVersion {
  id: number;
  page_id: number;
  version: number;
  title: string;
  body: string;
  edited_by: string | null;
  edited_at: string;
}

export interface MeetingNote {
  id: number;
  team_id: string | null;
  title: string;
  held_at: string;
  attendees: string[];
  notes: string;
  created_by: string | null;
  created_at: string;
}

export interface Decision {
  id: number;
  meeting_id: number;
  team_id: string | null;
  text: string;
  decided_on: string;
  created_by: string | null;
}

export interface Kudo {
  id: number;
  from_user: string;
  to_user: string;
  message: string;
  points: number;
  created_at: string;
}

export interface QuizState {
  day: string;
  available: boolean;
  question?: string;
  options?: string[];
  category?: string | null;
  answered?: boolean;
  chosen?: number | null;
  correct?: boolean | null;
  points?: number;
  correct_index?: number | null;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  sort: number;
}

export interface UserBadge {
  user_id: string;
  badge_id: string;
  earned_at: string;
}

export interface CoffeePair {
  round_id: number;
  user_a: string;
  user_b: string;
  channel_id: string | null;
}

export interface PeriodUserScore {
  user_id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  points: number;
}
