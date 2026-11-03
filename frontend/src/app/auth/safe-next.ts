/** Only same-origin absolute paths are accepted as a post-login target. */
export function safeNext(next: string | null | undefined): string {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')) {
    return next;
  }
  return '/';
}
