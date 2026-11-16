import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../core/language';

/** The one way to show a date: Intl in the active language. Impure, and reads the language signal, so it follows a switch. */
@Pipe({ name: 'appDate', pure: false })
export class AppDatePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: string | Date | null, style: 'date' | 'dateTime' = 'date'): string {
    if (value === null) return '';
    const options: Intl.DateTimeFormatOptions =
      style === 'dateTime' ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' };
    return new Intl.DateTimeFormat(this.language.lang(), options).format(new Date(value));
  }
}
