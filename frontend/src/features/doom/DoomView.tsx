import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServices } from '../../app/ServicesContext';
import { exposeForTests } from '../games/debug';
import { RunRecorder } from '../games/RunRecorder';
import { RunResult } from '../games/RunResult';
import { useMyStats } from '../games/PersonalStats';
import { DoomAudio } from './DoomAudio';
import { DoomGame, MAX_HEALTH, type DoomStatus } from './DoomGame';
import { Face } from './Face';
import { LEVEL_COUNT, LEVEL_NAMES, LEVEL_TOTALS } from './levels';
import { SCREEN_H, SCREEN_W, Raycaster } from './Raycaster';
import { scoreRun } from './scoring';

type Phase = 'ready' | 'playing' | 'paused' | DoomStatus;

interface Hud {
  health: number;
  clip: number;
  reserve: number;
  reloading: boolean;
  score: number;
  kills: number;
  left: number;
  level: number;
  message: string | null;
  nearExit: boolean;
}

const hudOf = (game: DoomGame): Hud => ({
  health: Math.ceil(game.player.health), clip: game.player.clip, reserve: game.player.reserve, reloading: game.player.reloadTimer > 0,
  score: game.score, kills: game.totalKills, left: game.enemiesLeft, level: game.levelIndex + 1,
  message: game.message?.text ?? null, nearExit: game.nearExit,
});

const MOVE_KEYS: Record<string, string> = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', KeyD: 'right', ArrowLeft: 'turnLeft', ArrowRight: 'turnRight' };
const MOUSE_SENSITIVITY = 0.0022;
const HUD_INTERVAL_MS = 100;
const MAX_FRAME_MS = 50;

/** De speelbare shooter: scherm, bediening met pointer lock, statusbalk, overlays en het opslaan van de score. */
export function DoomView() {
  const { games } = useServices();
  const navigate = useNavigate();
  const { reload: reloadStats } = useMyStats();
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef(new DoomGame());
  const recorder = useRef<RunRecorder | null>(null);
  const audio = useRef(new DoomAudio());
  const phaseRef = useRef<Phase>('ready');
  const keys = useRef(new Set<string>());
  const firing = useRef(false);
  const startedAt = useRef(Date.now());
  const finishing = useRef(false);
  const [phase, setPhaseState] = useState<Phase>('ready');
  const [hud, setHud] = useState<Hud>(() => hudOf(game.current));
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(v => v + 1), []);

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  // Levert de run precies één keer in bij de server; een run zonder punten telt niet mee.
  const finish = useCallback(async () => {
    const run = recorder.current;
    const current = game.current;
    if (!run || finishing.current || run.submitted) return;
    finishing.current = true;
    if (current.score === 0) {
      run.skip();
      setElapsed(Date.now() - startedAt.current);
      refresh();
      return;
    }
    setElapsed(Date.now() - startedAt.current);
    refresh();
    await run.submit(current.report());
    refresh();
    void reloadStats();
  }, [refresh, reloadStats]);

  const newRun = useCallback(() => {
    game.current = new DoomGame();
    recorder.current = new RunRecorder(games, 'doom');
    void recorder.current.begin().then(refresh);
    startedAt.current = Date.now();
    finishing.current = false;
    keys.current.clear();
    firing.current = false;
    setElapsed(0);
    setHud(hudOf(game.current));
    setPhase('ready');
  }, [games, refresh, setPhase]);

  const lock = useCallback(async () => {
    audio.current.unlock();
    try {
      await canvas.current?.requestPointerLock();
    } catch {
      // Zonder pointer lock kun je nog spelen met het toetsenbord (pijltjes om te draaien).
    }
    if (phaseRef.current === 'ready' || phaseRef.current === 'paused') {
      game.current.resume();
      setPhase('playing');
    }
  }, [setPhase]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    game.current.pause();
    document.exitPointerLock?.();
    setPhase('paused');
  }, [setPhase]);

  useEffect(() => {
    recorder.current = new RunRecorder(games, 'doom');
    void recorder.current.begin().then(refresh);
    const ctx = canvas.current?.getContext('2d') ?? null;
    const renderer = new Raycaster();
    const sound = audio.current;
    let frame = 0;
    let last = performance.now();
    let hudClock = 0;

    const loop = (now: number) => {
      const dt = Math.min(MAX_FRAME_MS, now - last);
      last = now;
      const g = game.current;
      if (phaseRef.current === 'playing') {
        const k = keys.current;
        g.input.forward = (k.has('forward') ? 1 : 0) - (k.has('back') ? 1 : 0);
        g.input.strafe = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
        g.input.keyTurn = (k.has('turnRight') ? 1 : 0) - (k.has('turnLeft') ? 1 : 0);
        g.input.sprint = k.has('sprint');
        g.input.firing = firing.current;
        g.update(dt);
        for (const event of g.drain()) sound.play(event);
        if (g.status === 'levelComplete' || g.status === 'dead' || g.status === 'victory') {
          document.exitPointerLock?.();
          firing.current = false;
          setPhase(g.status);
          setHud(hudOf(g));
          if (g.status !== 'levelComplete') void finish();
        }
      }
      if (ctx) renderer.render(ctx, g);
      hudClock += dt;
      if (hudClock >= HUD_INTERVAL_MS) {
        hudClock = 0;
        const next = hudOf(g);
        setHud(current => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const mapped = MOVE_KEYS[event.code];
      if (mapped) {
        keys.current.add(mapped);
        if (phaseRef.current !== 'paused' || document.pointerLockElement === null) event.preventDefault();
        return;
      }
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') { keys.current.add('sprint'); return; }
      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat && phaseRef.current === 'playing') game.current.interact();
      } else if (event.code === 'KeyR') {
        if (phaseRef.current === 'playing') game.current.reload();
      } else if (event.code === 'KeyM') {
        sound.muted = !sound.muted;
        setMuted(sound.muted);
      } else if (event.code === 'Escape' || event.code === 'KeyP') {
        // Met pointer lock laat de browser Escape het slot loslaten (dat pauzeert ook); pause() is veilig om dubbel aan te roepen.
        pause();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const mapped = MOVE_KEYS[event.code];
      if (mapped) keys.current.delete(mapped);
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') keys.current.delete('sprint');
    };
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement === canvas.current && phaseRef.current === 'playing') game.current.input.turn += event.movementX * MOUSE_SENSITIVITY;
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 0 && phaseRef.current === 'playing' && (document.pointerLockElement === canvas.current || event.target === canvas.current)) {
        firing.current = true;
        game.current.fire(); // direct schieten, zodat ook een heel korte klik telt; ingehouden blijft de loop herhalen
      }
    };
    const onMouseUp = (event: MouseEvent) => { if (event.button === 0) firing.current = false; };
    const onLockChange = () => {
      if (document.pointerLockElement === canvas.current) {
        if (phaseRef.current === 'ready' || phaseRef.current === 'paused') { game.current.resume(); setPhase('playing'); }
      } else if (phaseRef.current === 'playing') {
        game.current.pause();
        firing.current = false;
        keys.current.clear();
        setPhase('paused');
      }
    };
    const onHidden = () => { if (document.hidden) pause(); };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', pause);
    const unexpose = exposeForTests('doom', () => game.current);
    return () => {
      unexpose();
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('blur', pause);
      document.exitPointerLock?.();
      sound.close();
    };
  }, [games, refresh, pause, setPhase, finish]);

  const restart = async () => { await finish(); newRun(); };
  const back = async () => { await finish(); navigate('/games'); };
  const nextLevel = () => {
    if (game.current.nextLevel()) {
      setHud(hudOf(game.current));
      game.current.pause();
      setPhase('paused');
    }
  };

  const g = game.current;
  const breakdown = scoreRun(g.levels);
  const totals = LEVEL_TOTALS[Math.min(g.levelIndex, LEVEL_COUNT - 1)];
  const seconds = Math.floor(elapsed / 1000);
  const over = phase === 'dead' || phase === 'victory';

  return (
    <div className="dm-page">
      <div className="dm-screen">
        <canvas ref={canvas} className="dm-canvas" width={SCREEN_W} height={SCREEN_H} role="img" aria-label="DOOM-style game view" onClick={() => { if (phaseRef.current === 'ready' || phaseRef.current === 'paused') void lock(); }} />

        <div className="dm-hud" aria-label="Status">
          <div className="dm-cell"><small>Ammo</small><b className={hud.reloading ? 'blink' : ''}>{hud.reloading ? 'RELOAD' : `${hud.clip}`}<span>/{hud.reserve}</span></b></div>
          <div className="dm-cell"><small>Health</small><b className={hud.health <= 25 ? 'low' : ''} data-testid="health">{hud.health}%</b><i className="dm-bar"><u style={{ width: `${(hud.health / MAX_HEALTH) * 100}%` }} /></i></div>
          <Face health={hud.health} hurt={g.player.hurt > 0} />
          <div className="dm-cell"><small>Score</small><b data-testid="score">{hud.score.toLocaleString('en-US')}</b></div>
          <div className="dm-cell"><small>Kills</small><b data-testid="kills">{hud.kills}<span> · {hud.left} left</span></b></div>
          <div className="dm-cell"><small>Level</small><b data-testid="level">{hud.level}/{LEVEL_COUNT}<span> {LEVEL_NAMES[hud.level - 1]}</span></b></div>
        </div>
        {hud.message && phase === 'playing' && <div className="dm-message" role="status">{hud.message}</div>}
        {hud.nearExit && phase === 'playing' && <div className="dm-hint">Press SPACE to leave the level</div>}

        {phase === 'ready' && (
          <div className="dm-overlay" onClick={() => void lock()}>
            <h2>DOOM-style shooter</h2>
            <p>Three levels. Destroy the demons, collect health and ammo, then find the exit switch.</p>
            <dl>
              <dt>W A S D</dt><dd>Move</dd><dt>Mouse</dt><dd>Look and aim</dd><dt>Left click</dt><dd>Shoot</dd>
              <dt>Shift</dt><dd>Sprint</dd><dt>R</dt><dd>Reload</dd><dt>Space</dt><dd>Use the exit switch</dd><dt>Esc</dt><dd>Pause and release the mouse</dd>
            </dl>
            <button className="btn" onClick={event => { event.stopPropagation(); void lock(); }}>Click to play</button>
          </div>
        )}
        {phase === 'paused' && (
          <div className="dm-overlay" onClick={() => void lock()}>
            <h2>Paused</h2>
            <p>Click to continue</p>
            <div className="gm-actions">
              <button className="btn" onClick={event => { event.stopPropagation(); void lock(); }}>Resume</button>
              <button className="btn secondary" onClick={event => { event.stopPropagation(); void restart(); }}>Restart</button>
            </div>
          </div>
        )}
        {phase === 'levelComplete' && (
          <div className="dm-overlay">
            <h2>Level {g.levelIndex + 1} complete</h2>
            <dl>
              <dt>Enemies destroyed</dt><dd>{g.killsThisLevel} / {totals.imp + totals.brute + totals.boss}</dd>
              <dt>Level bonus</dt><dd>+500</dd>
              <dt>Health bonus</dt><dd>+{breakdown.healthBonus}</dd>
              <dt>All enemies bonus</dt><dd>+{breakdown.allEnemiesBonus}</dd>
              <dt>Score</dt><dd>{breakdown.total.toLocaleString('en-US')}</dd>
            </dl>
            <button className="btn" onClick={nextLevel}>Next level</button>
          </div>
        )}
        {over && (
          <div className="dm-overlay">
            <RunResult
              title={phase === 'victory' ? 'Victory!' : 'You died'}
              game="doom"
              score={g.score}
              rows={[
                ['Level reached', g.levelIndex + 1], ['Levels completed', breakdown.levelsCompleted], ['Enemies destroyed', breakdown.kills],
                ['Health bonus', breakdown.healthBonus], ['Time', `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`],
                ['Date', new Date().toLocaleDateString()],
              ]}
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

      <div className="dm-bar-row">
        <button className="btn secondary small" disabled={phase !== 'playing'} onClick={pause}>Pause</button>
        <button className="btn secondary small" onClick={() => void restart()}>Restart</button>
        <button className="btn secondary small" onClick={() => void back()}>Back</button>
        <button className="btn secondary small" onClick={() => { audio.current.unlock(); audio.current.muted = !audio.current.muted; setMuted(audio.current.muted); }}>{muted ? 'Sound off' : 'Sound on'}</button>
        <span className="dm-keys">WASD move · mouse aim · click shoot · Shift sprint · R reload · Space use · Esc pause · M mute</span>
      </div>
    </div>
  );
}

