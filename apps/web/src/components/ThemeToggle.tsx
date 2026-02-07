'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'cifras-theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as 'light' | 'dark' | null;
    const preferred = stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(preferred);
    document.documentElement.dataset.theme = preferred;
  }, []);

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <button className="button ghost" onClick={toggle} aria-label="Alternar tema">
      {theme === 'light' ? 'Modo noturno' : 'Modo claro'}
    </button>
  );
}
