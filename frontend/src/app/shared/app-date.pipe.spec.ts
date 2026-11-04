import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { provideTestTransloco } from '../testing/transloco';
import { AppDatePipe } from './app-date.pipe';

describe('AppDatePipe', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestTransloco()] });
    TestBed.inject(TranslocoService).setActiveLang('en');
  });
  const make = () => TestBed.runInInjectionContext(() => new AppDatePipe());

  it('formats a date in the active language', () => {
    expect(make().transform('2026-11-04T10:00:00Z')).toBe(
      new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date('2026-11-04T10:00:00Z')),
    );
    expect(make().transform('2026-11-04T10:00:00Z', 'date')).toMatch(/^Nov [34], 2026$/);
  });

  it('dateTime includes the time', () => {
    expect(make().transform(new Date('2026-11-04T10:00:00Z'), 'dateTime')).toMatch(/2026.*\d{1,2}:\d{2}/);
  });

  it('null gives an empty string', () => {
    expect(make().transform(null)).toBe('');
  });
});
