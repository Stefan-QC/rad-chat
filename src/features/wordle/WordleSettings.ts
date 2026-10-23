export interface WordleSettingsData {
  dark: boolean;
  contrast: boolean;
  sound: boolean;
  reduceMotion: boolean;
}

const STORAGE_KEY = 'radchat-wordle-settings';

/** Bewaart de weergave-instellingen van Wordle in localStorage. */
export class WordleSettings {
  static defaults(): WordleSettingsData {
    return {
      dark: window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
      contrast: false,
      sound: false,
      reduceMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    };
  }

  static load(): WordleSettingsData {
    try {
      return { ...WordleSettings.defaults(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
    } catch {
      return WordleSettings.defaults();
    }
  }

  static save(settings: WordleSettingsData): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Opslaan mislukt (bijvoorbeeld privémodus), de instellingen gelden dan alleen voor deze sessie.
    }
  }
}
