import { Injectable, signal } from '@angular/core';

export type Theme = 'system' | 'light' | 'dark';
export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

/** Where the choice is kept: per browser, a convenience only (an unreadable store falls back to System). */
const KEY = 'ricettine.theme';

function stored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** System leaves `data-theme` off so the stylesheet follows `prefers-color-scheme`; Light or Dark force it. */
function apply(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/** Called from main.ts before Angular starts, so a chosen theme is in place before the first paint. */
export function applyStoredTheme(): void {
  apply(stored());
}

/** The person's theme choice: System (follow the device), Light or Dark. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>(stored());
  readonly theme = this._theme.asReadonly();

  set(theme: Theme): void {
    this._theme.set(theme);
    apply(theme);
    try {
      if (theme === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      // storage unavailable (private mode, blocked): the choice holds for this visit only
    }
  }
}
