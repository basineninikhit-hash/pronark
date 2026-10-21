// Pronark always uses the light theme, even when the device is set to dark mode.
document.documentElement.classList.remove('dark');

export function useSystemTheme(): 'light' | 'dark' {
  return 'light';
}
