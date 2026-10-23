import { useCallback } from 'react';
import { useServices } from '../../app/ServicesContext';
import { useAsync } from '../../hooks/useAsync';
import type { WordleSettingsData } from './WordleSettings';

function ModalFrame({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="wd-modal" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="wd-modal-card" role="dialog" aria-modal="true">
        <button className="wd-modal-x" aria-label="Sluiten" onClick={onClose}>✕</button>
        {children}
      </div>
    </div>
  );
}

interface StatsModalProps {
  onClose: () => void;
  version: number;
  highlight: number | null;
}

/** Overzicht van gespeelde spellen, winstpercentage, reeksen en de verdeling van pogingen. */
export function StatsModal({ onClose, version, highlight }: StatsModalProps) {
  const { wordle } = useServices();
  const load = useCallback(() => wordle.stats().then(stats => ({ stats, version })), [wordle, version]);
  const { data, loading, error } = useAsync(load);
  const stats = data?.stats;
  const max = Math.max(1, ...(stats?.dist ?? [0]));
  const pct = stats && stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  return (
    <ModalFrame onClose={onClose}>
      <h3>Statistieken</h3>
      {loading && <p className="wd-note">Laden…</p>}
      {error && <p className="wd-note">{error}</p>}
      {stats && (
        <>
          <div className="wd-nums">
            <div><b>{stats.played}</b><span>Gespeeld</span></div>
            <div><b>{pct}</b><span>Winst %</span></div>
            <div><b>{stats.streak}</b><span>Huidige reeks</span></div>
            <div><b>{stats.max}</b><span>Langste reeks</span></div>
          </div>
          <h3>Verdeling pogingen</h3>
          <div className="wd-dist">
            {stats.dist.map((count, index) => (
              <div key={index}>
                <i>{index + 1}</i>
                <span className={highlight === index + 1 ? 'hi' : ''} style={{ width: `max(${Math.round((count / max) * 100)}%, 8%)` }}>{count}</span>
              </div>
            ))}
          </div>
          <p className="wd-note">Oefenspellen tellen niet mee.</p>
        </>
      )}
    </ModalFrame>
  );
}

const OPTIONS: { key: keyof WordleSettingsData; title: string; description: string }[] = [
  { key: 'dark', title: 'Dark mode', description: 'Donker kleurenschema' },
  { key: 'contrast', title: 'Hoog contrast', description: 'Oranje en blauw in plaats van groen en geel' },
  { key: 'sound', title: 'Geluidseffecten', description: 'Korte geluidjes tijdens het spelen' },
  { key: 'reduceMotion', title: 'Animaties verminderen', description: 'Geen flip-, spring- of schudanimaties' },
];

interface SettingsModalProps {
  settings: WordleSettingsData;
  onChange: (settings: WordleSettingsData) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onChange, onClose }: SettingsModalProps) {
  return (
    <ModalFrame onClose={onClose}>
      <h3>Instellingen</h3>
      {OPTIONS.map(option => (
        <label className="wd-set" key={option.key}>
          <span><b>{option.title}</b><small>{option.description}</small></span>
          <input type="checkbox" checked={settings[option.key]} onChange={event => onChange({ ...settings, [option.key]: event.target.checked })} />
          <i className="sw" />
        </label>
      ))}
    </ModalFrame>
  );
}
