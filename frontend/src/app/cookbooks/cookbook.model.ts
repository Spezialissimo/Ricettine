export type CookbookVisibility = 'PRIVATE' | 'PUBLIC';
type CookbookRole = 'OWNER' | 'AUTHOR';

/** A user as shown in a cookbook; the whole person is null when they deleted their account. */
export type Person = {
  id?: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type CookbookSummary = {
  id: string;
  name: string;
  visibility: CookbookVisibility;
  role: CookbookRole;
  recipeCount: number;
  coverThumbUrl: string | null;
  updatedAt: string;
};

export type CookbookEntry = {
  recipeId: string;
  title: string;
  author: Person | null;
  addedBy: Person | null;
  addedAt: string;
  mine: boolean;
  coverThumbUrl: string | null;
};

export type Cookbook = {
  id: string;
  name: string;
  description: string | null;
  visibility: CookbookVisibility;
  role: CookbookRole;
  owner: Person | null;
  authors: Person[];
  shareUrl: string | null;
  cover: { mediaId: string; thumbUrl: string; displayUrl: string } | null;
  recipes: CookbookEntry[];
  updatedAt: string;
};

/** Create body; on patch a missing field means unchanged. */
export type CookbookInput = {
  name: string;
  description: string | null;
  visibility: CookbookVisibility;
};

/** Exactly one of the two is set. */
export type RecipeRef =
  { recipeId: string; shareToken?: undefined } | { shareToken: string; recipeId?: undefined };

export const MAX_NAME = 100;
export const MAX_DESCRIPTION = 1000;

/** Length in Unicode code points, as the server counts. */
export const codePoints = (s: string): number => [...s].length;

/** Field error codes for a cookbook's (trimmed) name and description, checked as the server does. */
export function detailsErrors(name: string, description: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (name === '') errors['name'] = 'required';
  else if (codePoints(name) > MAX_NAME) errors['name'] = 'too_long';
  if (codePoints(description) > MAX_DESCRIPTION) errors['description'] = 'too_long';
  return errors;
}

/** "Ann and Bob": the owner, then the co-authors, joined the way `lang` joins a list. */
export function peopleList(owner: Person | null, authors: Person[], lang: string): string {
  const names = [owner, ...authors].filter((p) => p !== null).map((p) => p.displayName);
  if (names.length === 0) return '';
  return new Intl.ListFormat(lang, { type: 'conjunction' }).format(names);
}

type PublicCookbookEntry = {
  recipeId: string;
  title: string;
  author: Person | null;
  coverThumbUrl: string | null;
};

/** The anonymous view of a cookbook; `viewerRole` and `cookbookId` are set for members only. */
export type PublicCookbook = {
  name: string;
  description: string | null;
  owner: Person | null;
  authors: Person[];
  cover: { mediaId: string; thumbUrl: string; displayUrl: string } | null;
  recipes: PublicCookbookEntry[];
  viewerRole: CookbookRole | null;
  cookbookId?: string;
};

/** The share token: the last path segment of a cookbook's share URL. */
export const tokenFromShareUrl = (url: string | null): string | null => {
  const seg = url?.split(/[?#]/)[0].split('/').filter(Boolean).pop();
  return seg || null;
};

export type CookbookInvite = { id: string; createdAt: string; expiresAt: string };
export type CookbookInviteCreated = { id: string; url: string; expiresAt: string };
export type CookbookInvitePreview = {
  cookbookName: string;
  owner: Person | null;
  expiresAt: string;
};
