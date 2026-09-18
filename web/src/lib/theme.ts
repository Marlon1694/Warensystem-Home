import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'warensystem:theme';

function read(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function apply(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}

/**
 * Hell/dunkel folgt standardmäßig dem Gerät. Eine bewusste Auswahl gewinnt und
 * bleibt auf diesem Gerät gespeichert.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    try {
      return read();
    } catch {
      return 'system';
    }
  });

  useEffect(() => {
    apply(preference);
    try {
      if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Privater Modus: die Auswahl gilt dann nur für diese Sitzung.
    }
  }, [preference]);

  const cycle = useCallback(() => {
    setPreference((current) => (current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'));
  }, []);

  return { preference, setPreference, cycle };
}
