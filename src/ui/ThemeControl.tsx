import { Icon } from './Icon';
import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from 'react';

type Theme = 'system' | 'light' | 'dark';
const key = 'agentcanvas.theme';
const systemTheme = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches;
const subscribeSystemTheme = (notify: () => void) => {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
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
  const systemDark = useSyncExternalStore(subscribeSystemTheme, systemTheme);
  const dark = theme === 'system' ? systemDark : theme === 'dark';
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
        title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={() => change(dark ? 'light' : 'dark')}
      >
        <Icon name={dark ? 'sun' : 'moon'} />
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
