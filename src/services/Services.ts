import type { AppConfig } from '../config/AppConfig';
import { createDb, type Db } from '../core/supabase';
import { ActivityService } from './ActivityService';
import { AuditService } from './AuditService';
import { AuthService } from './AuthService';
import { ChannelService } from './ChannelService';
import { CraftNetwork } from './CraftNetwork';
import { CraftService } from './CraftService';
import { LeaderboardService } from './LeaderboardService';
import { LobbyPresence } from './LobbyPresence';
import { MessageService } from './MessageService';
import { ProfileService } from './ProfileService';
import { TeamService } from './TeamService';
import { WordleService } from './WordleService';
import { VoiceHub } from './voice/VoiceHub';

/** Bouwt alle services één keer op en deelt ze met de hele app. */
export class Services {
  readonly db: Db;
  readonly auth: AuthService;
  readonly profiles: ProfileService;
  readonly channels: ChannelService;
  readonly messages: MessageService;
  readonly teams: TeamService;
  readonly leaderboard: LeaderboardService;
  readonly activity: ActivityService;
  readonly audit: AuditService;
  readonly wordle: WordleService;
  readonly craft: CraftService;
  readonly craftNetwork: CraftNetwork;
  readonly lobby: LobbyPresence;
  readonly voice: VoiceHub;

  constructor(config: AppConfig) {
    this.db = createDb(config);
    this.auth = new AuthService(this.db);
    this.profiles = new ProfileService(this.db);
    this.channels = new ChannelService(this.db);
    this.messages = new MessageService(this.db);
    this.teams = new TeamService(this.db);
    this.leaderboard = new LeaderboardService(this.db);
    this.activity = new ActivityService(this.db);
    this.audit = new AuditService(this.db);
    this.wordle = new WordleService(this.db);
    this.craft = new CraftService(this.db);
    this.craftNetwork = new CraftNetwork(this.db);
    this.lobby = new LobbyPresence(this.db);
    this.voice = new VoiceHub(this.db, this.activity);
  }
}
