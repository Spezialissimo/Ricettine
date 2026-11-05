export interface FeedAuthor {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface FeedItem {
  id: string;
  title: string;
  author: FeedAuthor;
  shareToken: string;
  coverThumbUrl: string | null;
  publishedAt: string;
}

export interface FeedResponse {
  items: FeedItem[];
  nextCursor: string | null;
}
