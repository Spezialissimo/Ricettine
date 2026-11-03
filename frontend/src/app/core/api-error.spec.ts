import { HttpErrorResponse } from '@angular/common/http';
import en from '../../../public/i18n/en.json';
import { KNOWN_ERROR_CODES, errorKey, toApiError } from './api-error';

describe('api-error', () => {
  it('maps a ProblemDetail body', () => {
    const e = new HttpErrorResponse({ status: 409, error: { code: 'email_taken', status: 409 } });
    expect(toApiError(e)).toEqual({ status: 409, code: 'email_taken', fields: undefined });
  });

  it('keeps validation fields', () => {
    const e = new HttpErrorResponse({
      status: 400,
      error: { code: 'validation_failed', fields: { email: 'bad' } },
    });
    expect(toApiError(e).fields).toEqual({ email: 'bad' });
  });

  it('maps status 0 to network_error', () => {
    expect(toApiError(new HttpErrorResponse({ status: 0 }))).toEqual({
      status: 0,
      code: 'network_error',
    });
  });

  it('maps unknown things to unknown', () => {
    expect(toApiError(new Error('x')).code).toBe('unknown');
    expect(toApiError(new HttpErrorResponse({ status: 500, error: 'oops' })).code).toBe('unknown');
  });

  it('maps the busy code (503 when password hashing is saturated)', () => {
    const e = new HttpErrorResponse({ status: 503, error: { code: 'busy', status: 503 } });
    expect(errorKey(toApiError(e))).toBe('errors.busy');
  });

  it('errorKey falls back to errors.unknown', () => {
    expect(errorKey({ status: 409, code: 'email_taken' })).toBe('errors.email_taken');
    expect(errorKey({ status: 418, code: 'teapot' })).toBe('errors.unknown');
  });

  it('en.json has an entry for every known error code', () => {
    for (const code of KNOWN_ERROR_CODES) {
      expect((en.errors as Record<string, string>)[code], code).toBeTruthy();
    }
    expect(en.errors.unknown).toBeTruthy();
  });
});
