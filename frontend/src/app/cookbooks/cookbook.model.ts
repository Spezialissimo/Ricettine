export type CookbookVisibility = 'PRIVATE' | 'PUBLIC';
export type CookbookRole = 'OWNER' | 'AUTHOR';

/** A user as shown in a cookbook; the whole person is null when they deleted their account. */
export type Person = { username: string; displayName: string; avatarUrl: string | null };

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
export type CookbookInput = { name: string; description: string | null; visibility: CookbookVisibility };

/** Exactly one of the two is set. */
export type RecipeRef = { recipeId: string; shareToken?: undefined } | { shareToken: string; recipeId?: undefined };

export const MAX_NAME = 100;
export const MAX_DESCRIPTION = 1000;

/** Length in Unicode code points, as the server counts. */
export const codePoints = (s: string): number => [...s].length;
