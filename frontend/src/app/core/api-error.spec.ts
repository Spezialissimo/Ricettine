import { HttpErrorResponse } from '@angular/common/http';
import en from '../../../public/i18n/en.json';
import { KNOWN_ERROR_CODES, KNOWN_FIELD_ERROR_CODES, errorKey, fieldErrorKey, toApiError } from './api-error';

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

  it('maps too_many_attempts and too_many_photos', () => {
    for (const code of ['too_many_attempts', 'too_many_photos']) {
      expect(errorKey({ status: 429, code })).toBe(`errors.${code}`);
    }
  });

  it('errorKey falls back to errors.unknown', () => {
    expect(errorKey({ status: 409, code: 'email_taken' })).toBe('errors.email_taken');
    expect(errorKey({ status: 418, code: 'teapot' })).toBe('errors.unknown');
  });

  it('en.json has an entry for every known error code', () => {
    for (const code of KNOWN_ERROR_CODES) {
      expect((en.errors as unknown as Record<string, string>)[code], code).toBeTruthy();
    }
    expect(en.errors.unknown).toBeTruthy();
  });
});

describe('fieldErrorKey', () => {
  it('maps a known field code to errors.field.{code}', () => {
    expect(fieldErrorKey('required')).toBe('errors.field.required');
  });
  it('falls back to errors.validation_failed for an unknown code', () => {
    expect(fieldErrorKey('nope')).toBe('errors.validation_failed');
  });
  it('en.json errors.field has exactly the known field codes', () => {
    expect(Object.keys(en.errors.field).sort()).toEqual([...KNOWN_FIELD_ERROR_CODES].sort());
  });
});
