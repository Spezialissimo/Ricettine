/** Resolves a stored media reference to a URL served by the backend (`/media/...`). */
export function mediaUrl(ref: string | null | undefined): string | null {
  if (!ref) return null;
  return ref.startsWith('/') ? ref : `/media/${ref}`;
}
