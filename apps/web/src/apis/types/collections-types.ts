// Mirror of the API's /v1/collections response shapes.

export interface MovieSnapshot {
  name: string;
  posterUrl: string;
  thumbUrl: string;
  type: string;
  year: number | null;
  quality: string;
}

export interface CollectionItem {
  movieSlug: string;
  sort: number;
  snapshot: MovieSnapshot;
}

export interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_url: string;
  sort: number;
  created_at: string;
}

export interface CollectionDetail extends Collection {
  items: CollectionItem[];
}

export interface CollectionWriteInput {
  slug: string;
  title: string;
  description?: string;
  cover_url?: string;
  is_published?: boolean;
  sort?: number;
}

export interface CollectionItemInput {
  snapshot: MovieSnapshot;
  sort?: number;
}
