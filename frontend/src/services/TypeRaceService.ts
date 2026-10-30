import { debounce } from '../core/realtime';
import { expectOk, unwrap, type Db } from '../core/supabase';
import { RaceChannel } from '../features/typerace/RaceChannel';
import { parseTime, type OpenLobby, type RaceDuration, type RaceLanguage, type RaceLobby, type RacePlayer, type RaceResult, type RaceStatus } from '../features/typerace/typerace';

export interface SyncInfo {
  /** De tijd van de server in milliseconden. */
  serverNow: number;
  inLobby: boolean;
  status: RaceStatus | null;
  round: number | null;
  sentAt: number;
  receivedAt: number;
}

export interface LobbySnapshot {
  lobby: RaceLobby | null;
  players: RacePlayer[];
  results: RaceResult[];
}

export interface ProgressReport {
  round: number;
  correctChars: number;
  keystrokes: number;
  correctKeystrokes: number;
  finished: boolean;
}

/** Praat met de type-race-functies in de database; alle spelregels en tijden liggen bij de server. */
export class TypeRaceService {
  constructor(private readonly db: Db) {}

  async openLobbies(): Promise<OpenLobby[]> {
    return unwrap<OpenLobby[]>(await this.db.rpc('typerace_open_lobbies'));
  }

  /** De lobby waarin deze gebruiker nu zit, zodat een pagina die ververst wordt weer in de juiste lobby terugkomt. */
  async myLobbyId(userId: string): Promise<string | null> {
    const row = unwrap<{ lobby_id: string } | null>(await this.db.from('typerace_players').select('lobby_id').eq('user_id', userId).maybeSingle());
    return row?.lobby_id ?? null;
  }

  async create(language: RaceLanguage, duration: RaceDuration): Promise<string> {
    return unwrap<string>(await this.db.rpc('typerace_create', { p_language: language, p_duration: duration }));
  }

  async join(lobbyId: string): Promise<void> {
    expectOk(await this.db.rpc('typerace_join', { p_lobby: lobbyId }));
  }

  async leave(): Promise<void> {
    expectOk(await this.db.rpc('typerace_leave'));
  }

  async updateSettings(lobbyId: string, language: RaceLanguage, duration: RaceDuration): Promise<void> {
    expectOk(await this.db.rpc('typerace_settings', { p_lobby: lobbyId, p_language: language, p_duration: duration }));
  }

  async start(lobbyId: string): Promise<void> {
    expectOk(await this.db.rpc('typerace_start', { p_lobby: lobbyId }));
  }

  /** Hartslag, volgende stap van de state machine en de servertijd in één aanroep. */
  async sync(lobbyId: string): Promise<SyncInfo> {
    const sentAt = Date.now();
    const data = unwrap<{ server_now: string; in_lobby: boolean; status: RaceStatus | null; round: number | null }>(
      await this.db.rpc('typerace_sync', { p_lobby: lobbyId }),
    );
    return { serverNow: parseTime(data.server_now), inLobby: data.in_lobby, status: data.status, round: data.round, sentAt, receivedAt: Date.now() };
  }

  async report(lobbyId: string, report: ProgressReport): Promise<void> {
    expectOk(await this.db.rpc('typerace_report', {
      p_lobby: lobbyId, p_round: report.round, p_correct_chars: report.correctChars,
      p_keystrokes: report.keystrokes, p_correct_keystrokes: report.correctKeystrokes, p_finished: report.finished,
    }));
  }

  async load(lobbyId: string): Promise<LobbySnapshot> {
    const lobby = unwrap<RaceLobby | null>(await this.db.from('typerace_lobbies').select('*').eq('id', lobbyId).maybeSingle());
    if (!lobby) return { lobby: null, players: [], results: [] };
    const [players, results] = await Promise.all([
      this.db.from('typerace_players').select('*').eq('lobby_id', lobbyId).order('joined_at'),
      this.db.from('typerace_results').select('*').eq('lobby_id', lobbyId).eq('round', lobby.round),
    ]);
    return { lobby, players: unwrap<RacePlayer[]>(players), results: unwrap<RaceResult[]>(results) };
  }

  /** Meldt wijzigingen in één lobby; gebundeld, want tijdens een race komen er veel updates tegelijk. */
  watchLobby(lobbyId: string, onChange: () => void): () => void {
    const notify = debounce(onChange, 250);
    const channel = this.db.channel(`typerace-db-${lobbyId}`);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'typerace_lobbies', filter: `id=eq.${lobbyId}` }, notify);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'typerace_players', filter: `lobby_id=eq.${lobbyId}` }, notify);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'typerace_results', filter: `lobby_id=eq.${lobbyId}` }, notify);
    channel.subscribe();
    return () => { void this.db.removeChannel(channel); };
  }

  /** Meldt wijzigingen in de lijst met lobby's. */
  watchLobbyList(onChange: () => void): () => void {
    const notify = debounce(onChange, 400);
    const channel = this.db.channel('typerace-lobby-list');
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'typerace_lobbies' }, notify);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'typerace_players' }, notify);
    channel.subscribe();
    return () => { void this.db.removeChannel(channel); };
  }

  openChannel(lobbyId: string, userId: string): RaceChannel {
    return new RaceChannel(this.db, lobbyId, userId);
  }
}
