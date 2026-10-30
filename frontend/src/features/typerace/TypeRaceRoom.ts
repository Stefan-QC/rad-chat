import { messageOf } from '../../core/AppError';
import { Emitter } from '../../core/Emitter';
import type { GameService } from '../../services/GameService';
import type { ProgressReport, TypeRaceService } from '../../services/TypeRaceService';
import type { GameScore } from '../games/types';
import { RaceChannel } from './RaceChannel';
import { ServerClock } from './ServerClock';
import type { LiveProgress } from './standings';
import { racePhase, type RaceLobby, type RacePhase, type RacePlayer, type RaceResult } from './typerace';

export interface RoomState {
  lobby: RaceLobby | null;
  players: RacePlayer[];
  results: RaceResult[];
  /** De punten die de server na afloop van de ronde heeft vastgelegd (basisscore, bonus en totaal). */
  scores: GameScore[];
  live: Record<string, LiveProgress>;
  /** False zodra de server meldt dat je niet meer in deze lobby zit (bijvoorbeeld na een lange verbindingsonderbreking). */
  inLobby: boolean;
  loading: boolean;
  error: string | null;
}

const IDLE_SYNC_MS = 3000;
const RACE_SYNC_MS = 1000;
const FULL_REFRESH_MS = 4000;

/**
 * Houdt één lobby actief in de browser: laadt de gegevens, luistert naar wijzigingen, houdt de hartslag en de servertijd bij
 * en verbindt de snelle voortgangsverbinding. De hook `useTypeRaceRoom` laat React erop meeluisteren.
 */
export class TypeRaceRoom extends Emitter<{ change: RoomState }> {
  readonly clock = new ServerClock();
  private readonly channel: RaceChannel;
  private state: RoomState = { lobby: null, players: [], results: [], scores: [], live: {}, inLobby: true, loading: true, error: null };
  private stopWatching: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastRefresh = 0;
  private running = false;

  constructor(
    private readonly service: TypeRaceService,
    private readonly games: GameService,
    readonly lobbyId: string,
    readonly userId: string,
  ) {
    super();
    this.channel = service.openChannel(lobbyId, userId);
  }

  get snapshot(): RoomState {
    return this.state;
  }

  /** De fase van de race, op basis van de servertijd. */
  phase(): RacePhase {
    return this.state.lobby ? racePhase(this.state.lobby, this.clock.now()) : 'lobby';
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.channel.on('progress', live => this.update({ live: { ...this.state.live, [live.userId]: live } }));
    this.channel.open();
    this.stopWatching = this.service.watchLobby(this.lobbyId, () => void this.refresh());
    void this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stopWatching?.();
    this.stopWatching = null;
    this.channel.close();
  }

  /** Verlaat de lobby; de server draagt het hostschap over of ruimt de lobby op. */
  async leave(): Promise<void> {
    this.stop();
    await this.service.leave();
  }

  broadcast(progress: Omit<LiveProgress, 'userId'>): void {
    this.channel.send(progress);
  }

  async report(report: ProgressReport): Promise<void> {
    try {
      await this.service.report(this.lobbyId, report);
    } catch {
      // Een gemiste tussentijdse melding is niet erg; de volgende komt vanzelf.
    }
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    try {
      const info = await this.service.sync(this.lobbyId);
      this.clock.update(info.serverNow, info.sentAt, info.receivedAt);
      if (!info.inLobby) this.update({ inLobby: false, loading: false });
      const stale = Date.now() - this.lastRefresh > FULL_REFRESH_MS;
      const changed = info.round !== this.state.lobby?.round || info.status !== this.state.lobby?.status;
      if (info.inLobby && (stale || changed || !this.state.lobby)) await this.refresh();
    } catch (e) {
      this.update({ error: messageOf(e), loading: false });
    }
    if (!this.running) return;
    const phase = this.phase();
    const racing = phase !== 'lobby' && phase !== 'finished';
    this.timer = setTimeout(() => void this.tick(), racing ? RACE_SYNC_MS : IDLE_SYNC_MS);
  }

  private async refresh(): Promise<void> {
    if (!this.running) return;
    try {
      const data = await this.service.load(this.lobbyId);
      this.lastRefresh = Date.now();
      const newRound = data.lobby?.round !== this.state.lobby?.round;
      const scores = await this.loadScores(data.lobby, newRound);
      this.update({ ...data, scores, live: newRound ? {} : this.state.live, inLobby: data.lobby !== null, loading: false, error: null });
    } catch (e) {
      this.update({ error: messageOf(e), loading: false });
    }
  }

  /** De punten van de laatste ronde; die bestaan pas als de ronde is afgelopen, en ontbreken ze, dan blijft het spel gewoon werken. */
  private async loadScores(lobby: RaceLobby | null, newRound: boolean): Promise<GameScore[]> {
    if (!lobby || lobby.status !== 'finished' || lobby.round === 0) return newRound ? [] : this.state.scores;
    try {
      return await this.games.typeRaceScores(lobby.id, lobby.round);
    } catch {
      return [];
    }
  }

  private update(patch: Partial<RoomState>): void {
    this.state = { ...this.state, ...patch };
    this.emit('change', this.state);
  }
}
