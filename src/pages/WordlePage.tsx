import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { useWorkspace } from '../app/WorkspaceContext';
import { Icon } from '../components/Icon';
import type { WordleState } from '../core/types';
import { useAsync } from '../hooks/useAsync';
import { Board } from '../features/wordle/Board';
import { Keyboard } from '../features/wordle/Keyboard';
import { SettingsModal, StatsModal } from '../features/wordle/Modals';
import { formatCountdown, msUntilAmsterdamMidnight } from '../features/wordle/clock';
import { DailyGame, PracticeGame, WordleRules, type GameMode, type WordleGame } from '../features/wordle/WordleEngine';
import { WordleSettings, type WordleSettingsData } from '../features/wordle/WordleSettings';
import { WordleSounds } from '../features/wordle/WordleSounds';
import { useWordleGame } from '../features/wordle/useWordleGame';

const SHARE_EMOJI = {
  normal: { correct: '🟩', present: '🟨', absent: '⬛' },
  contrast: { correct: '🟧', present: '🟦', absent: '⬛' },
};

function MiniLeaderboard() {
  const { leaderboard } = useServices();
  const { me } = useAuth();
  const load = useCallback(() => leaderboard.users(10), [leaderboard]);
  const { data, reload } = useAsync(load);
  useEffect(() => leaderboard.watch(() => void reload()), [leaderboard, reload]);
  return (
    <aside className="wd-side">
      <h3>Leaderboard</h3>
      <ol id="board">
        {data?.filter(row => row.points > 0).map(row => (
          <li key={row.user_id} className={row.user_id === me?.id ? 'me' : ''}><span>{row.display_name}</span><b>{row.points}</b></li>
        ))}
      </ol>
      <p className="lb-hint">Punten: Wordle winnen en bouwen in RAD Craft.</p>
    </aside>
  );
}

function EndPanel({ state, mode, onNewGame, onShare, shared }: {
  state: WordleState;
  mode: GameMode;
  onNewGame: () => void;
  onShare: () => void;
  shared: boolean;
}) {
  const [remaining, setRemaining] = useState(msUntilAmsterdamMidnight());
  useEffect(() => {
    if (mode !== 'daily') return;
    const timer = setInterval(() => setRemaining(msUntilAmsterdamMidnight()), 1000);
    return () => clearInterval(timer);
  }, [mode]);
  return (
    <div className="wd-end">
      {mode === 'daily' ? (
        <>
          <div className="wd-countdown">Volgende Wordle over {formatCountdown(remaining)}</div>
          <button className="btn" onClick={onShare} disabled={shared}>{shared ? 'Gedeeld in #general' : 'Deel in chat'}</button>
        </>
      ) : (
        <button className="btn" onClick={onNewGame}>Nieuw spel</button>
      )}
      {state.status === 'won' && state.points > 0 && <div className="wd-countdown">+{state.points} punten</div>}
    </div>
  );
}

interface GameAreaProps {
  game: WordleGame;
  settings: WordleSettingsData;
  sounds: WordleSounds;
  modalOpen: boolean;
  onFinish: (state: WordleState) => void;
  onNewGame: () => void;
  onDayChange: () => void;
}

/** Het speelbord met toetsenbord, meldingen en het eindscherm voor één spel. */
function GameArea({ game, settings, sounds, modalOpen, onFinish, onNewGame, onDayChange }: GameAreaProps) {
  const { messages } = useServices();
  const { me } = useAuth();
  const { channels } = useWorkspace();
  const { state, loadError, current, reveal, shakeRow, bounceRow, toasts, press } = useWordleGame(game, settings, sounds, onFinish);
  const [shared, setShared] = useState(false);
  const pressRef = useRef(press);
  pressRef.current = press;

  useEffect(() => {
    if (modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || target?.closest('input, textarea, select')) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === 'Enter' || key === 'Backspace' || /^[a-z]$/.test(key)) {
        event.preventDefault();
        pressRef.current(key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalOpen]);

  // Zodra het dagelijkse spel afgelopen is en het nieuwe woord beschikbaar komt, laden we het nieuwe spel.
  useEffect(() => {
    if (game.mode !== 'daily' || !state || state.status === 'playing') return;
    const timer = setTimeout(onDayChange, msUntilAmsterdamMidnight() + 1500);
    return () => clearTimeout(timer);
  }, [game, state, onDayChange]);

  const visibleGuesses = useMemo(() => {
    if (!state) return [];
    return reveal ? state.guesses.slice(0, reveal.row) : state.guesses;
  }, [state, reveal]);

  const share = async () => {
    if (!state || !me) return;
    const general = channels.find(c => c.team_id === null && c.kind === 'text' && c.name === 'general') ?? channels.find(c => c.kind === 'text');
    if (!general) return;
    const emoji = settings.contrast ? SHARE_EMOJI.contrast : SHARE_EMOJI.normal;
    const grid = state.guesses.map(g => g.marks.map(m => emoji[m]).join('')).join('\n');
    await messages.send(general.id, me.id, `RAD Wordle ${state.day} ${state.status === 'won' ? state.guesses.length : 'X'}/6\n${grid}`);
    setShared(true);
  };

  if (loadError) return <div className="banner error">{loadError}</div>;
  if (!state) return <div className="wd-card"><p className="wd-note">Laden…</p></div>;
  return (
    <div className="wd-card">
      <div className="wd-toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className="wd-toast">{t.text}</div>)}</div>
      <Board state={state} current={current} reveal={reveal} shakeRow={shakeRow} bounceRow={bounceRow} />
      <Keyboard marks={WordleRules.keyboardMarks(visibleGuesses)} onKey={press} />
      {state.status !== 'playing' && !reveal && <EndPanel state={state} mode={game.mode} onNewGame={onNewGame} onShare={() => void share()} shared={shared} />}
    </div>
  );
}

/** Wordle in het Nederlands: dagelijks woord met punten, of een willekeurig oefenwoord. */
export function WordlePage() {
  const services = useServices();
  const navigate = useNavigate();
  const { toggleDrawer } = useWorkspace();
  const [settings, setSettings] = useState<WordleSettingsData>(WordleSettings.load);
  const [mode, setMode] = useState<GameMode>('daily');
  const [round, setRound] = useState(0);
  const [modal, setModal] = useState<'stats' | 'settings' | null>(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const [lastWinRow, setLastWinRow] = useState<number | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const sounds = useMemo(() => new WordleSounds(() => settingsRef.current.sound), []);
  const game = useMemo<WordleGame>(() => (mode === 'daily' ? new DailyGame(services.wordle) : new PracticeGame()), [mode, round, services.wordle]);

  // Elke spelsessie wordt vastgelegd, zodat beheerders kunnen zien wanneer er gespeeld is.
  useEffect(() => {
    let sessionId: number | null = null;
    let cancelled = false;
    services.activity.start('wordle').then(id => { if (cancelled) void services.activity.end(id); else sessionId = id; }).catch(() => undefined);
    return () => {
      cancelled = true;
      if (sessionId !== null) void services.activity.end(sessionId);
    };
  }, [services.activity]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setModal(null);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const changeSettings = (next: WordleSettingsData) => {
    setSettings(next);
    WordleSettings.save(next);
  };

  const onFinish = useCallback((state: WordleState) => {
    if (mode !== 'daily') return;
    setLastWinRow(state.status === 'won' ? state.guesses.length : null);
    setStatsVersion(v => v + 1);
    setModal('stats');
  }, [mode]);

  const changeMode = (next: GameMode) => {
    if (next === mode) return;
    setMode(next);
    setRound(r => r + 1);
  };

  return (
    <div id="wordle" className={`${settings.dark ? 'dark' : ''} ${settings.contrast ? 'hc' : ''} ${settings.reduceMotion ? 'reduce' : ''}`}>
      <div className="wd-wrap">
        <header>
          <div className="wd-left">
            <button className="iconbtn wd-menu" aria-label="Menu" onClick={toggleDrawer}><Icon name="menu" /></button>
            <button className="wd-close" onClick={() => navigate('/')}>Back to chat</button>
          </div>
          <h2>WORDLE</h2>
          <div className="wd-icons">
            <button className="wd-icon" aria-label="Statistieken" onClick={() => setModal('stats')}><Icon name="stats" size={24} /></button>
            <button className="wd-icon" aria-label="Instellingen" onClick={() => setModal('settings')}><Icon name="gear" size={24} /></button>
          </div>
        </header>
        <div className="wd-tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'daily'} className={mode === 'daily' ? 'on' : ''} onClick={() => changeMode('daily')}>Dagelijks</button>
          <button role="tab" aria-selected={mode === 'practice'} className={mode === 'practice' ? 'on' : ''} onClick={() => changeMode('practice')}>Oefenen</button>
        </div>
        <div className="wd-body">
          <GameArea
            key={`${mode}-${round}`}
            game={game}
            settings={settings}
            sounds={sounds}
            modalOpen={modal !== null}
            onFinish={onFinish}
            onNewGame={() => setRound(r => r + 1)}
            onDayChange={() => setRound(r => r + 1)}
          />
          <MiniLeaderboard />
        </div>
        {modal === 'stats' && <StatsModal onClose={() => setModal(null)} version={statsVersion} highlight={lastWinRow} />}
        {modal === 'settings' && <SettingsModal settings={settings} onChange={changeSettings} onClose={() => setModal(null)} />}
      </div>
    </div>
  );
}
