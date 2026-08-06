// Mirrors the auth response shapes from the XoPhim API (/v1/auth/*).
// The API is the source of truth; keep these in sync manually.

export interface AuthUser {
  id: string;
  username: string | null;
  email: string;
  role: string;
}

export interface LoginPayload {
  usernameOrEmail: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export interface GuestWatchlistItem {
  movieSlug: string;
  movieSnapshot: Record<string, unknown>;
  createdAt: string; // ISO datetime
}

export interface GuestProgressItem {
  movieSlug: string;
  episodeSlug: string;
  serverName: string;
  positionSec: number;
  durationSec: number | null;
  movieSnapshot: Record<string, unknown>;
  updatedAt: string; // ISO datetime
}

export interface MergeGuestPayload {
  watchlist: GuestWatchlistItem[];
  progress: GuestProgressItem[];
}

export interface MergeGuestResult {
  watchlistMerged: number;
  progressMerged: number;
}
