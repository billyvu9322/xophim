// Types mirroring the /v1/me/* response shapes.
// The API is the source of truth; keep these in sync with user-state/routes.ts.

export interface MovieSnapshot {
  name: string;
  posterUrl: string;
  type: string;
  year: number | null;
}

export interface WatchlistItem {
  id: string;
  movie_slug: string;
  movie_snapshot: MovieSnapshot;
  created_at: string; // ISO 8601
}

export interface ProgressItem {
  id: string;
  movie_slug: string;
  episode_slug: string; // 'full' for phim lẻ
  server_name: string;
  position_sec: number;
  duration_sec: number | null;
  movie_snapshot: MovieSnapshot;
  updated_at: string; // ISO 8601
}

export interface WatchlistResponse {
  items: WatchlistItem[];
}

export interface HistoryResponse {
  items: ProgressItem[];
}

export interface SaveProgressPayload {
  slug: string;
  episodeSlug: string;
  server: string;
  positionSec: number;
  durationSec?: number | null;
  snapshot: MovieSnapshot;
}
