import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

type ThemePreference = Theme | 'system';

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem('kavis-theme-preference');
    return saved === 'light' || saved === 'dark' || saved === 'system'
      ? saved
      : 'system';
  });

  const [theme, setTheme] = useState<Theme>(() =>
    preference === 'system' ? getSystemTheme() : preference
  );

  useEffect(() => {
    localStorage.setItem('kavis-theme-preference', preference);

    if (preference !== 'system') {
      setTheme(preference);
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncWithSystem = () => setTheme(media.matches ? 'dark' : 'light');
    syncWithSystem();
    media.addEventListener('change', syncWithSystem);

    return () => media.removeEventListener('change', syncWithSystem);
  }, [preference]);

  useEffect(() => {
    document.documentElement.classList.remove('dark-mode', 'light-mode');
    document.documentElement.classList.add(`${theme}-mode`);
  }, [theme]);

  function toggleTheme() {
    setPreference(theme === 'dark' ? 'light' : 'dark');
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme ThemeProvider içinde kullanılmalı.');
  }

  return context;
}
