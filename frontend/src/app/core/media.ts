const BARE_ID = /^[A-Za-z0-9._-]+$/;

/**
 * Resolves a stored media reference to a URL served by the backend. Only `/media/...` paths and bare
 * ids are accepted; anything else (absolute URLs, `//host/...`, other paths) yields null.
 */
export function mediaUrl(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (ref.startsWith('/media/')) return ref.includes('..') ? null : ref;
  return BARE_ID.test(ref) && !ref.includes('..') ? `/media/${ref}` : null;
}
