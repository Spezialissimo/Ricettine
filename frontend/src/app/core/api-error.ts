import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoService } from '@jsverse/transloco';

export type ApiError = { status: number; code: string; fields?: Record<string, string>; mediaIds?: string[] };

/** Every `code` the backend can emit (plus frontend-only network_error / unknown). */
export const KNOWN_ERROR_CODES: readonly string[] = [
  'bad_credentials',
  'bad_request',
  'busy',
  'conflict',
  'email_taken',
  'file_too_large',
  'forbidden',
  'image_too_large',
  'internal_error',
  'invalid_email',
  'invalid_unit',
  'invalid_username',
  'invite_invalid',
  'last_admin',
  'method_not_allowed',
  'not_authenticated',
  'not_found',
  'password_too_long',
  'password_too_short',
  'photo_not_in_recipe',
  'recipe_conflict',
  'recipe_incomplete',
  'recipe_not_found',
  'reset_invalid',
  'setup_already_done',
  'unsupported_image',
  'unsupported_media_type',
  'username_reserved',
  'username_taken',
  'validation_failed',
  'network_error',
  'unknown',
];

export function toApiError(e: unknown): ApiError {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) {
      return { status: 0, code: 'network_error' };
    }
    const body = e.error;
    if (body && typeof body === 'object' && typeof body.code === 'string') {
      return {
        status: e.status,
        code: body.code,
        fields: body.fields ?? undefined,
        mediaIds: Array.isArray(body.mediaIds) ? body.mediaIds.filter((m: unknown) => typeof m === 'string') : undefined,
      };
    }
    return { status: e.status, code: 'unknown' };
  }
  return { status: 0, code: 'unknown' };
}

export function errorKey(e: ApiError): string {
  return KNOWN_ERROR_CODES.includes(e.code) ? `errors.${e.code}` : 'errors.unknown';
}

/** Key for a per-field server error code: `errors.field.{code}`, else `errors.validation_failed`. */
export function fieldErrorKey(transloco: TranslocoService, code: string): string {
  const key = `errors.field.${code}`;
  return transloco.translate(key) !== key ? key : 'errors.validation_failed';
}
