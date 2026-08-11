import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  GuestProgressItem,
  GuestWatchlistItem,
} from "../apis/types/auth-types";

interface GuestState {
  watchlist: GuestWatchlistItem[];
  progress: GuestProgressItem[];

  addToWatchlist: (item: GuestWatchlistItem) => void;
  removeFromWatchlist: (movieSlug: string) => void;

  upsertProgress: (item: GuestProgressItem) => void;
  removeProgress: (movieSlug: string) => void;

  clear: () => void;
}

export const useGuestStore = create<GuestState>()(
  persist(
    (set, get) => ({
      watchlist: [],
      progress: [],

      addToWatchlist: (item) => {
        const existing = get().watchlist.find(
          (w) => w.movieSlug === item.movieSlug,
        );
        if (existing) return;
        set((s) => ({ watchlist: [...s.watchlist, item] }));
      },

      removeFromWatchlist: (movieSlug) => {
        set((s) => ({
          watchlist: s.watchlist.filter((w) => w.movieSlug !== movieSlug),
        }));
      },

      upsertProgress: (item) => {
        set((s) => {
          const idx = s.progress.findIndex(
            (p) =>
              p.movieSlug === item.movieSlug &&
              p.episodeSlug === item.episodeSlug,
          );
          if (idx === -1) {
            return { progress: [...s.progress, item] };
          }
          const existing = s.progress[idx]!;
          // Never overwrite a row whose updatedAt is newer or equal.
          if (new Date(existing.updatedAt) >= new Date(item.updatedAt)) {
            return s;
          }
          const updated = [...s.progress];
          updated[idx] = item;
          return { progress: updated };
        });
      },

      removeProgress: (movieSlug) => {
        set((s) => ({
          progress: s.progress.filter((p) => p.movieSlug !== movieSlug),
        }));
      },

      clear: () => set({ watchlist: [], progress: [] }),
    }),
    { name: "xophim-guest" },
  ),
);
