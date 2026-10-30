import { messageOf } from '../../core/AppError';
import type { GameService } from '../../services/GameService';
import type { SessionGame, SubmittedScore } from './types';

export type RecorderState = 'idle' | 'starting' | 'ready' | 'unavailable' | 'submitting' | 'saved' | 'failed' | 'skipped';

/**
 * Houdt de score van één run bij de server bij: opent de sessie, levert de gebeurtenissen precies één keer in en
 * onthoudt wat de server heeft vastgelegd. Lukt het openen niet, dan blijft de game gewoon speelbaar maar zonder opslag.
 */
export class RunRecorder {
  state: RecorderState = 'idle';
  error: string | null = null;
  saved: SubmittedScore | null = null;
  private sessionId: string | null = null;

  constructor(
    private readonly games: GameService,
    private readonly game: SessionGame,
  ) {}

  get canSave(): boolean {
    return this.sessionId !== null;
  }

  get submitted(): boolean {
    return this.state === 'submitting' || this.state === 'saved' || this.state === 'failed' || this.state === 'skipped';
  }

  async begin(): Promise<void> {
    this.state = 'starting';
    try {
      this.sessionId = await this.games.start(this.game);
      this.state = 'ready';
    } catch (e) {
      this.state = 'unavailable';
      this.error = messageOf(e);
    }
  }

  /** Een run zonder punten wordt niet opgeslagen; zo staat er geen "bezig met opslaan" voor altijd op het scherm. */
  skip(): void {
    if (!this.submitted) this.state = 'skipped';
  }

  /** Levert de run in. Een tweede aanroep doet niets, zodat een score nooit dubbel wordt verstuurd. */
  async submit(report: object): Promise<SubmittedScore | null> {
    if (this.submitted) return this.saved;
    // Een sessie die nog wordt geopend, krijgt even de tijd voordat we opgeven.
    for (let attempt = 0; attempt < 20 && this.state === 'starting'; attempt += 1) await new Promise(resolve => setTimeout(resolve, 100));
    if (this.submitted) return this.saved;
    if (!this.sessionId) {
      this.state = 'unavailable';
      return null;
    }
    this.state = 'submitting';
    try {
      this.saved = await this.games.submit(this.sessionId, report);
      this.state = 'saved';
      return this.saved;
    } catch (e) {
      this.state = 'failed';
      this.error = messageOf(e);
      return null;
    }
  }
}
