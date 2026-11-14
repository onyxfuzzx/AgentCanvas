import { Icon } from './Icon';
import { useEffect, useLayoutEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';
const key = 'agentcanvas.theme';
function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(key);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}
export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  useEffect(() => {
    const sync = (event: Event) =>
      setTheme((event as CustomEvent<Theme>).detail);
    window.addEventListener('agentcanvas-theme', sync);
    return () => window.removeEventListener('agentcanvas-theme', sync);
  }, []);
  const change = (value: Theme) => {
    setTheme(value);
    window.dispatchEvent(
      new CustomEvent('agentcanvas-theme', { detail: value }),
    );
  };
  useLayoutEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    try {
      localStorage.setItem(key, theme);
    } catch {
      /* Theme still works when storage is unavailable. */
    }
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  if (compact)
    return (
      <button
        title="Toggle theme"
        aria-label="Toggle theme"
        onClick={() =>
          change(
            document.documentElement.dataset.theme === 'dark'
              ? 'light'
              : 'dark',
          )
        }
      >
        <Icon name="sun" />
      </button>
    );
  return (
    <label className="theme-control">
      Theme
      <select
        aria-label="Theme"
        value={theme}
        onChange={(e) => change(e.target.value as Theme)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
