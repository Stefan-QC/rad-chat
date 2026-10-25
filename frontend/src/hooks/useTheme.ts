import { useEffect, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import type { ResolvedTheme, ThemePreference } from '../core/ThemeService';

/** Geeft het gekozen en het werkelijk toegepaste thema terug en werkt mee als het verandert. */
export function useTheme(): { preference: ThemePreference; resolved: ResolvedTheme; setPreference: (value: ThemePreference) => void } {
  const { theme } = useServices();
  const [state, setState] = useState({ preference: theme.getPreference(), resolved: theme.getResolved() });
  useEffect(() => theme.on('change', setState), [theme]);
  return { ...state, setPreference: value => theme.setPreference(value) };
}
