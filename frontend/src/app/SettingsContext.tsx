import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messageOf } from '../core/AppError';
import type { UserSettings, UserSettingsPatch } from '../core/types';
import { SettingsService } from '../services/SettingsService';
import { useMe } from './AuthContext';
import { useServices } from './ServicesContext';
import { useToast } from '../components/ui/Toast';

interface SettingsValue {
  settings: UserSettings;
  update: (patch: UserSettingsPatch) => Promise<void>;
}

const SettingsContext = createContext<SettingsValue | null>(null);

/** Laadt de instellingen na het inloggen en past thema en weergave meteen toe. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { settings: service, theme } = useServices();
  const me = useMe();
  const toast = useToast();
  const [settings, setSettings] = useState<UserSettings>(() => SettingsService.defaults(me.id));

  useEffect(() => {
    let active = true;
    service.load(me.id).then(loaded => {
      if (!active) return;
      if (loaded) {
        setSettings(loaded);
        theme.setPreference(loaded.theme);
      } else {
        // Nog niets opgeslagen: de lokale themakeuze blijft gelden.
        setSettings({ ...SettingsService.defaults(me.id), theme: theme.getPreference() });
      }
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [service, theme, me.id]);

  useEffect(() => {
    document.documentElement.dataset.density = settings.compact_mode ? 'compact' : 'comfortable';
  }, [settings.compact_mode]);

  const update = useCallback(async (patch: UserSettingsPatch) => {
    const previous = settings;
    const optimistic = { ...settings, ...patch };
    setSettings(optimistic);
    if (patch.theme) theme.setPreference(patch.theme);
    try {
      setSettings((await service.save(me.id, patch)) ?? optimistic);
    } catch (error) {
      setSettings(previous);
      if (patch.theme) theme.setPreference(previous.theme);
      toast.error(messageOf(error));
    }
  }, [settings, service, theme, me.id, toast]);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
