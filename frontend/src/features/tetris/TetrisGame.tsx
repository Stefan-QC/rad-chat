import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServices } from '../../app/ServicesContext';
import { exposeForTests } from '../games/debug';
import { RunRecorder } from '../games/RunRecorder';
import { RunResult } from '../games/RunResult';
import { useMyStats } from '../games/PersonalStats';
import { PiecePreview } from './PiecePreview';
import { TetrisController } from './TetrisController';
import { TetrisEngine, type EngineStatus } from './TetrisEngine';
import type { PieceType } from './pieces';
import { BOARD_HEIGHT, BOARD_WIDTH, drawBoard } from './TetrisRenderer';

interface Snapshot {
  score: number;
  level: number;
  lines: number;
  status: EngineStatus;
  held: PieceType | null;
  next: PieceType[];
  flash: string | null;
}

const MAX_FRAME_MS = 100;

const snapshotOf = (engine: TetrisEngine): Snapshot => ({
  score: engine.score, level: engine.level, lines: engine.lines, status: engine.status, held: engine.held, next: engine.next,
  flash: engine.lastClear ? ({ 1: 'Single', 2: 'Double', 3: 'Triple', 4: 'TETRIS!' } as Record<number, string>)[engine.lastClear.lines] ?? null : null,
});

const sameSnapshot = (a: Snapshot, b: Snapshot) => JSON.stringify(a) === JSON.stringify(b);

/** Het speelbare Tetris-veld met bediening, spelstand, voorvertoningen en het resultaatscherm. */
export function TetrisGame() {
  const { games } = useServices();
  const navigate = useNavigate();
  const { reload: reloadStats } = useMyStats();
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef(new TetrisEngine());
  const controller = useRef<TetrisController | null>(null);
  const recorder = useRef<RunRecorder | null>(null);
  const [snap, setSnap] = useState<Snapshot>(() => snapshotOf(engine.current));
  const [, setVersion] = useState(0);
  const startedAt = useRef(Date.now());
  const finishing = useRef(false);
  const [elapsed, setElapsed] = useState(0);

  const refresh = useCallback(() => setVersion(v => v + 1), []);

  // Levert de huidige run precies één keer in bij de server; een spel zonder gespeelde blokken telt niet.
  const finish = useCallback(async () => {
    const run = recorder.current;
    const game = engine.current;
    if (!run || finishing.current || run.submitted) return;
    finishing.current = true;
    if (game.score === 0) {
      run.skip();
      setElapsed(Date.now() - startedAt.current);
      refresh();
      return;
    }
    setElapsed(Date.now() - startedAt.current);
    refresh();
    await run.submit(game.report());
    refresh();
    void reloadStats();
  }, [refresh, reloadStats]);

  const start = useCallback(() => {
    engine.current = new TetrisEngine();
    controller.current?.setEngine(engine.current);
    recorder.current = new RunRecorder(games, 'tetris');
    void recorder.current.begin().then(refresh);
    startedAt.current = Date.now();
    finishing.current = false;
    setElapsed(0);
    setSnap(snapshotOf(engine.current));
  }, [games, refresh]);

  const togglePause = useCallback(() => {
    const game = engine.current;
    if (game.status === 'playing') game.pause();
    else if (game.status === 'paused') game.resume();
    setSnap(snapshotOf(game));
  }, []);

  // Eén spel loopt per keer: klok, toetsen en tekenen horen bij dit onderdeel en worden bij verlaten opgeruimd.
  useEffect(() => {
    controller.current = new TetrisController(engine.current, togglePause);
    recorder.current = new RunRecorder(games, 'tetris');
    void recorder.current.begin().then(refresh);
    const ctx = canvas.current?.getContext('2d') ?? null;
    let frame = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(MAX_FRAME_MS, now - last);
      last = now;
      controller.current?.update(dt);
      if (ctx) drawBoard(ctx, engine.current);
      const next = snapshotOf(engine.current);
      setSnap(current => (sameSnapshot(current, next) ? current : next));
      if (engine.current.over) void finish();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (controller.current?.keyDown(event.code, event.repeat)) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => controller.current?.keyUp(event.code);
    const onHidden = () => { if (document.hidden && engine.current.status === 'playing') togglePause(); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('visibilitychange', onHidden);
    const unexpose = exposeForTests('tetris', () => engine.current);
    return () => {
      unexpose();
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [games, togglePause, refresh, finish]);

  const restart = async () => {
    await finish();
    start();
  };
  const back = async () => {
    await finish();
    navigate('/games');
  };

  const over = snap.status === 'over';
  const game = engine.current;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');

  return (
    <div className="tt-page">
      <aside className="tt-side">
        <section className="tt-box"><h4>Hold</h4><PiecePreview type={snap.held} label="Hold piece" /></section>
        <section className="tt-box tt-stats">
          <div><small>Score</small><b data-testid="score">{snap.score.toLocaleString('en-US')}</b></div>
          <div><small>Level</small><b data-testid="level">{snap.level}</b></div>
          <div><small>Lines</small><b data-testid="lines">{snap.lines}</b></div>
        </section>
      </aside>

      <div className="tt-board-wrap">
        <canvas ref={canvas} className="tt-board" width={BOARD_WIDTH} height={BOARD_HEIGHT} role="img" aria-label="Tetris playfield" />
        {snap.flash && <div className="tt-flash" key={`${game.lines}-${game.pieces}`}>{snap.flash}</div>}
        {snap.status === 'paused' && (
          <div className="tt-overlay">
            <h2>Paused</h2>
            <p>Press P or Esc to continue</p>
            <button className="btn" onClick={togglePause}>Resume</button>
          </div>
        )}
        {over && (
          <div className="tt-overlay">
            <RunResult
              title="Game over"
              game="tetris"
              score={game.score}
              rows={[['Level', game.level], ['Lines', game.lines], ['Pieces', game.pieces], ['Time', `${minutes}:${seconds}`], ['Date', new Date().toLocaleDateString()]]}
              recorder={recorder.current}
            >
              <div className="gm-actions">
                <button className="btn" onClick={() => void restart()}>Play again</button>
                <button className="btn secondary" onClick={() => void back()}>Back to games</button>
              </div>
            </RunResult>
          </div>
        )}
      </div>

      <aside className="tt-side">
        <section className="tt-box"><h4>Next</h4>{snap.next.map((type, index) => <PiecePreview key={index} type={type} label={`Next piece ${index + 1}`} />)}</section>
        <div className="tt-buttons">
          <button className="btn secondary" disabled={over} onClick={togglePause}>{snap.status === 'paused' ? 'Resume' : 'Pause'}</button>
          <button className="btn secondary" onClick={() => void restart()}>Restart</button>
          <button className="btn secondary" onClick={() => void back()}>Back</button>
        </div>
        <section className="tt-box tt-help">
          <h4>Controls</h4>
          <dl>
            <dt>← →</dt><dd>Move</dd>
            <dt>↓</dt><dd>Soft drop</dd>
            <dt>↑ / X</dt><dd>Rotate right</dd>
            <dt>Z</dt><dd>Rotate left</dd>
            <dt>Space</dt><dd>Hard drop</dd>
            <dt>C</dt><dd>Hold</dd>
            <dt>P / Esc</dt><dd>Pause</dd>
          </dl>
        </section>
      </aside>
    </div>
  );
}

