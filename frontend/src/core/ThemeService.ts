import { Emitter } from './Emitter';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeEvents {
  change: { preference: ThemePreference; resolved: ResolvedTheme };
}

const STORAGE_KEY = 'radchat-theme';

/** Beheert de lichte en donkere modus van de hele website en onthoudt de keuze in de browser. */
export class ThemeService extends Emitter<ThemeEvents> {
  private preference: ThemePreference;
  private readonly query = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    super();
    this.preference = ThemeService.readStored();
    this.apply();
    this.query.addEventListener('change', () => {
      if (this.preference === 'system') this.apply();
    });
  }

  getPreference(): ThemePreference {
    return this.preference;
  }

  getResolved(): ResolvedTheme {
    if (this.preference === 'system') return this.query.matches ? 'dark' : 'light';
    return this.preference;
  }

  setPreference(preference: ThemePreference): void {
    if (preference === this.preference) return;
    this.preference = preference;
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Opslaan mislukt (bijvoorbeeld privémodus), de keuze geldt dan alleen voor deze sessie.
    }
    this.apply();
  }

  private apply(): void {
    const resolved = this.getResolved();
    document.documentElement.setAttribute('data-theme', resolved);
    this.emit('change', { preference: this.preference, resolved });
  }

  private static readStored(): ThemePreference {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
    } catch {
      return 'system';
    }
  }
}
