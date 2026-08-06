// Pure helpers for the collections layer. Exported so they are unit-testable
// in isolation from Fastify and Drizzle.

export interface MovieSnapshot {
  name: string;
  posterUrl: string;
  thumbUrl: string;
  type: string;
  year: number | null;
  quality: string;
}

export interface WithPublished {
  id: string;
  is_published: boolean;
  sort: number;
}

export interface RawItem {
  collection_id: string;
  movie_slug: string;
  sort: number;
  movie_snapshot: unknown;
}

export interface EnrichedItem {
  movieSlug: string;
  sort: number;
  snapshot: MovieSnapshot;
}

// Keep only published rows.
export function filterPublished<T extends WithPublished>(rows: T[]): T[] {
  return rows.filter((r) => r.is_published);
}

// New array sorted ascending by .sort. Stable (Array.prototype.sort is stable).
export function sortBySort<T extends { sort: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sort - b.sort);
}

function parseSnapshot(raw: unknown): MovieSnapshot {
  if (raw === null || typeof raw !== "object") {
    return { name: "", posterUrl: "", thumbUrl: "", type: "", year: null, quality: "" };
  }
  const r = raw as Record<string, unknown>;
  return {
    name: typeof r.name === "string" ? r.name : "",
    posterUrl: typeof r.posterUrl === "string" ? r.posterUrl : "",
    thumbUrl: typeof r.thumbUrl === "string" ? r.thumbUrl : "",
    type: typeof r.type === "string" ? r.type : "",
    year: typeof r.year === "number" ? r.year : null,
    quality: typeof r.quality === "string" ? r.quality : "",
  };
}

// Maps raw Drizzle rows (movie_snapshot jsonb → unknown) to typed EnrichedItem[].
export function enrichItems(items: RawItem[]): EnrichedItem[] {
  return items.map((item) => ({
    movieSlug: item.movie_slug,
    sort: item.sort,
    snapshot: parseSnapshot(item.movie_snapshot),
  }));
}
