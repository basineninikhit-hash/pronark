import { useSyncExternalStore } from 'react';

// Pronark follows the device's light/dark setting. The `.dark` class drives the shadcn tokens.
const query = window.matchMedia('(prefers-color-scheme: dark)');
const apply = () => document.documentElement.classList.toggle('dark', query.matches);
apply();
query.addEventListener('change', apply);

export function useSystemTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (listener) => { query.addEventListener('change', listener); return () => query.removeEventListener('change', listener); },
    () => (query.matches ? 'dark' : 'light'),
  );
}
