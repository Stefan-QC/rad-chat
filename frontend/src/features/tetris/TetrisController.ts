import { LINE_POINTS, type TetrisEngine, type TetrisReport } from './TetrisEngine';

/** Hoe lang je een richtingstoets inhoudt voordat hij herhaalt, en hoe snel hij daarna herhaalt. */
export const DAS_MS = 160;
export const ARR_MS = 45;
/** Hoe snel het blok zakt zolang je de pijl omlaag inhoudt. */
export const SOFT_DROP_MS = 40;

export const HANDLED_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'KeyX', 'KeyZ', 'Space', 'KeyC', 'KeyP', 'Escape'] as const;

/** Rekent de score na uit de gebeurtenissen van een run, op dezelfde manier als de server. */
export function scoreFromReport(report: TetrisReport): number {
  let lines = 0;
  let points = 0;
  for (const cleared of report.clears) {
    points += LINE_POINTS[cleared] * (1 + Math.floor(lines / 10));
    lines += cleared;
  }
  return points + report.soft + report.hard * 2;
}

/**
 * Vertaalt toetsen en tijd naar acties op de engine: verplaatsen met herhaling (DAS en ARR), zacht vallen, draaien,
 * hard droppen, vasthouden en pauzeren. De browser levert alleen keydown, keyup en de tijd per beeld.
 */
export class TetrisController {
  private direction: -1 | 0 | 1 = 0;
  private directionHeld = new Set<'ArrowLeft' | 'ArrowRight'>();
  private dasAcc = 0;
  private repeating = false;
  private down = false;
  private softAcc = 0;

  constructor(
    private engine: TetrisEngine,
    private readonly onPauseToggle: () => void,
  ) {}

  setEngine(engine: TetrisEngine): void {
    this.engine = engine;
    this.reset();
  }

  reset(): void {
    this.direction = 0;
    this.directionHeld.clear();
    this.dasAcc = 0;
    this.repeating = false;
    this.down = false;
    this.softAcc = 0;
  }

  /** Geeft true terug als de toets van de game is, zodat de pagina hem niet ook laat scrollen. */
  keyDown(code: string, repeat = false): boolean {
    if (!(HANDLED_KEYS as readonly string[]).includes(code)) return false;
    if (repeat) return true;
    if (code === 'KeyP' || code === 'Escape') {
      this.onPauseToggle();
      return true;
    }
    if (this.engine.status !== 'playing') return true;
    switch (code) {
      case 'ArrowLeft':
      case 'ArrowRight':
        this.directionHeld.add(code);
        this.direction = code === 'ArrowLeft' ? -1 : 1;
        this.dasAcc = 0;
        this.repeating = false;
        this.engine.move(this.direction);
        break;
      case 'ArrowDown':
        this.down = true;
        this.softAcc = 0;
        this.engine.softDrop();
        break;
      case 'ArrowUp':
      case 'KeyX':
        this.engine.rotate(1);
        break;
      case 'KeyZ':
        this.engine.rotate(-1);
        break;
      case 'Space':
        this.engine.hardDrop();
        break;
      case 'KeyC':
        this.engine.hold();
        break;
    }
    return true;
  }

  keyUp(code: string): void {
    if (code === 'ArrowDown') this.down = false;
    if (code === 'ArrowLeft' || code === 'ArrowRight') {
      this.directionHeld.delete(code);
      const [remaining] = [...this.directionHeld];
      this.direction = remaining === undefined ? 0 : remaining === 'ArrowLeft' ? -1 : 1;
      this.dasAcc = 0;
      this.repeating = this.direction !== 0 && this.repeating;
    }
  }

  /** Herhaalt ingehouden toetsen en laat de engine de tijd verwerken. */
  update(dtMs: number): void {
    if (this.engine.status !== 'playing') return;
    if (this.direction !== 0) {
      this.dasAcc += dtMs;
      if (!this.repeating && this.dasAcc >= DAS_MS) {
        this.repeating = true;
        this.dasAcc -= DAS_MS;
      }
      if (this.repeating) {
        while (this.dasAcc >= ARR_MS) {
          this.engine.move(this.direction);
          this.dasAcc -= ARR_MS;
        }
      }
    }
    if (this.down) {
      this.softAcc += dtMs;
      while (this.softAcc >= SOFT_DROP_MS) {
        this.engine.softDrop();
        this.softAcc -= SOFT_DROP_MS;
      }
    }
    this.engine.tick(dtMs);
  }
}
