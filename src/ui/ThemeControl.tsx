import { useLayoutEffect, useState } from 'react';

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
export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>(savedTheme);
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
  return (
    <label className="theme-control">
      Theme
      <select
        aria-label="Theme"
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
