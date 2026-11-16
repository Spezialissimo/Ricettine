import { TestBed } from '@angular/core/testing';
import { ThemeService, applyStoredTheme } from './theme';

const root = () => document.documentElement;

describe('theme', () => {
  afterEach(() => {
    localStorage.clear();
    root().removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  it('starts on System: no data-theme, so the stylesheet follows the device', () => {
    applyStoredTheme();
    expect(root().hasAttribute('data-theme')).toBe(false);
    expect(TestBed.inject(ThemeService).theme()).toBe('system');
  });

  it('applies and remembers Dark and Light; System forgets the choice', () => {
    const theme = TestBed.inject(ThemeService);
    theme.set('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('ricettine.theme')).toBe('dark');
    theme.set('light');
    expect(root().getAttribute('data-theme')).toBe('light');
    theme.set('system');
    expect(root().hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('ricettine.theme')).toBeNull();
  });

  it('restores a stored choice before Angular starts, and ignores junk', () => {
    localStorage.setItem('ricettine.theme', 'dark');
    applyStoredTheme();
    expect(root().getAttribute('data-theme')).toBe('dark');
    localStorage.setItem('ricettine.theme', 'purple');
    applyStoredTheme();
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it('works without storage: falls back to System and still switches for this visit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    applyStoredTheme();
    expect(root().hasAttribute('data-theme')).toBe(false);
    const theme = TestBed.inject(ThemeService);
    expect(theme.theme()).toBe('system');
    theme.set('dark');
    expect(theme.theme()).toBe('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');
  });
});
