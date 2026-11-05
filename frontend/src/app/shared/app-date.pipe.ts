import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

/** The one way to show a date: Intl in the active language. Impure so it follows language changes. */
@Pipe({ name: 'appDate', pure: false })
export class AppDatePipe implements PipeTransform {
  private readonly i18n = inject(TranslocoService);

  transform(value: string | Date | null, style: 'date' | 'dateTime' = 'date'): string {
    if (value === null) return '';
    const options: Intl.DateTimeFormatOptions =
      style === 'dateTime' ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' };
    return new Intl.DateTimeFormat(this.i18n.getActiveLang(), options).format(new Date(value));
  }
}
