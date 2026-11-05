import { FeedAuthor } from '../feed/feed.model';

export interface ProfileRecipe {
  id: string;
  title: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  visibility: 'PRIVATE' | 'PUBLIC';
  /** Null for drafts. */
  shareToken: string | null;
  coverThumbUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface ProfileCookbook {
  id: string;
  name: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  recipeCount: number;
  shareToken: string;
  coverThumbUrl: string | null;
}

export interface Profile {
  person: FeedAuthor;
  self: boolean;
  recipes: ProfileRecipe[];
  cookbooks: ProfileCookbook[];
}
