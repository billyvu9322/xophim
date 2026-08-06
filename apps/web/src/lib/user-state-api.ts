import { api } from "./api";
import type {
  HistoryResponse,
  MovieSnapshot,
  ProgressItem,
  SaveProgressPayload,
  WatchlistItem,
  WatchlistResponse,
} from "./user-state-types";

// All functions call /v1/me/* which requires auth (session cookie).
// api.ts sets withCredentials: true, so the sid cookie rides along.
export const userStateApi = {
  getWatchlist: async (): Promise<WatchlistResponse> => {
    const res = await api.get<WatchlistResponse>("/me/watchlist");
    return res.data;
  },

  addToWatchlist: async (slug: string, movie_snapshot: MovieSnapshot): Promise<WatchlistItem> => {
    const res = await api.put<WatchlistItem>(`/me/watchlist/${slug}`, { movie_snapshot });
    return res.data;
  },

  removeFromWatchlist: async (slug: string): Promise<void> => {
    await api.delete(`/me/watchlist/${slug}`);
  },

  getHistory: async (): Promise<HistoryResponse> => {
    const res = await api.get<HistoryResponse>("/me/history");
    return res.data;
  },

  saveProgress: async (payload: SaveProgressPayload): Promise<ProgressItem> => {
    const res = await api.put<ProgressItem>("/me/progress", payload);
    return res.data;
  },

  deleteHistory: async (slug: string): Promise<void> => {
    await api.delete(`/me/history/${slug}`);
  },
};
