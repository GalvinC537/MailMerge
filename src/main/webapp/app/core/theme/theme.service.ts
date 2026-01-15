import { Injectable } from '@angular/core';

export type AppTheme = 'light' | 'dark';

const STORAGE_KEY = 'mm_theme';
const ATTR = 'data-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  getTheme(): AppTheme {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;

    // default = system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  setTheme(theme: AppTheme): void {
    localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.setAttribute(ATTR, theme);
  }

  toggleTheme(): AppTheme {
    const next: AppTheme = this.getTheme() === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
    return next;
  }

  // Call once on app start (or navbar init) to apply stored/system theme
  applyTheme(): AppTheme {
    const theme = this.getTheme();
    this.setTheme(theme);
    return theme;
  }
}
