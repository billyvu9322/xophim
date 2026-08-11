import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth";
import { userStateApi } from "@/apis/user-state-api";
import { useGuestStore } from "../stores/guest-store";
import type {
  MovieSnapshot,
  ProgressItem,
  SaveProgressPayload,
  WatchlistItem,
} from "../apis/types/user-state-types";

export const userStateKeys = {
  watchlist: ["user-state", "watchlist"] as const,
  history: ["user-state", "history"] as const,
};

// Throttle helper — exported so the player can gate saves (~15s / on pause).
const PROGRESS_THROTTLE_MS = 15_000;
export function shouldThrottleProgressSave(
  lastSavedAt: number | null,
): boolean {
  if (lastSavedAt === null) return false;
  return Date.now() - lastSavedAt < PROGRESS_THROTTLE_MS;
}

const asRecord = (s: MovieSnapshot): Record<string, unknown> =>
  s as unknown as Record<string, unknown>;
const asSnapshot = (r: Record<string, unknown>): MovieSnapshot =>
  r as unknown as MovieSnapshot;

// ---------------------------------------------------------------------------
// useWatchlist — logged in → server; guest → useGuestStore (localStorage).
// ---------------------------------------------------------------------------
export function useWatchlist() {
  const { data: user } = useAuth();
  const guestWatchlist = useGuestStore((s) => s.watchlist);

  const serverQuery = useQuery({
    queryKey: userStateKeys.watchlist,
    queryFn: () => userStateApi.getWatchlist(),
    enabled: !!user,
    staleTime: 30_000,
    select: (data) => data.items,
  });

  if (user) {
    return {
      items: serverQuery.data ?? [],
      isLoading: serverQuery.isLoading,
      error: serverQuery.error,
    };
  }
  const items: WatchlistItem[] = guestWatchlist.map((g) => ({
    id: `guest-${g.movieSlug}`,
    movie_slug: g.movieSlug,
    movie_snapshot: asSnapshot(g.movieSnapshot),
    created_at: g.createdAt,
  }));
  return { items, isLoading: false, error: null };
}

// ---------------------------------------------------------------------------
// useToggleWatchlist — logged in → PUT/DELETE + optimistic; guest → store.
// ---------------------------------------------------------------------------
export function useToggleWatchlist() {
  const { data: user } = useAuth();
  const qc = useQueryClient();
  const addGuest = useGuestStore((s) => s.addToWatchlist);
  const removeGuest = useGuestStore((s) => s.removeFromWatchlist);

  const serverMutation = useMutation({
    mutationFn: async ({
      slug,
      snapshot,
      currentlyInWatchlist,
    }: {
      slug: string;
      snapshot: MovieSnapshot;
      currentlyInWatchlist: boolean;
    }) => {
      if (currentlyInWatchlist) {
        await userStateApi.removeFromWatchlist(slug);
      } else {
        await userStateApi.addToWatchlist(slug, snapshot);
      }
    },
    onMutate: async ({ slug, snapshot, currentlyInWatchlist }) => {
      await qc.cancelQueries({ queryKey: userStateKeys.watchlist });
      const previous = qc.getQueryData<{ items: WatchlistItem[] }>(
        userStateKeys.watchlist,
      );
      qc.setQueryData<{ items: WatchlistItem[] }>(
        userStateKeys.watchlist,
        (old) => {
          const items = old?.items ?? [];
          if (currentlyInWatchlist) {
            return { items: items.filter((i) => i.movie_slug !== slug) };
          }
          const optimistic: WatchlistItem = {
            id: `optimistic-${slug}`,
            movie_slug: slug,
            movie_snapshot: snapshot,
            created_at: new Date().toISOString(),
          };
          return { items: [optimistic, ...items] };
        },
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(userStateKeys.watchlist, context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: userStateKeys.watchlist });
    },
  });

  return {
    toggle: (
      slug: string,
      snapshot: MovieSnapshot,
      currentlyInWatchlist: boolean,
    ) => {
      if (user) {
        serverMutation.mutate({ slug, snapshot, currentlyInWatchlist });
      } else if (currentlyInWatchlist) {
        removeGuest(slug);
      } else {
        addGuest({
          movieSlug: slug,
          movieSnapshot: asRecord(snapshot),
          createdAt: new Date().toISOString(),
        });
      }
    },
    isPending: serverMutation.isPending,
    error: serverMutation.error,
  };
}

// ---------------------------------------------------------------------------
// useHistory — logged in → server (desc updated_at); guest → store.
// ---------------------------------------------------------------------------
export function useHistory() {
  const { data: user } = useAuth();
  const guestProgress = useGuestStore((s) => s.progress);

  const serverQuery = useQuery({
    queryKey: userStateKeys.history,
    queryFn: () => userStateApi.getHistory(),
    enabled: !!user,
    staleTime: 30_000,
    select: (data) => data.items,
  });

  if (user) {
    return {
      items: serverQuery.data ?? [],
      isLoading: serverQuery.isLoading,
      error: serverQuery.error,
    };
  }
  const items: ProgressItem[] = guestProgress.map((g) => ({
    id: `guest-${g.movieSlug}-${g.episodeSlug}`,
    movie_slug: g.movieSlug,
    episode_slug: g.episodeSlug,
    server_name: g.serverName,
    position_sec: g.positionSec,
    duration_sec: g.durationSec,
    movie_snapshot: asSnapshot(g.movieSnapshot),
    updated_at: g.updatedAt,
  }));
  return { items, isLoading: false, error: null };
}

// ---------------------------------------------------------------------------
// useDeleteHistory — logged in → DELETE + optimistic; guest → remove local rows.
// ---------------------------------------------------------------------------
export function useDeleteHistory() {
  const { data: user } = useAuth();
  const qc = useQueryClient();
  const removeGuestProgress = useGuestStore((s) => s.removeProgress);

  const serverMutation = useMutation({
    mutationFn: (slug: string) => userStateApi.deleteHistory(slug),
    onMutate: async (slug) => {
      await qc.cancelQueries({ queryKey: userStateKeys.history });
      const previous = qc.getQueryData<{ items: ProgressItem[] }>(
        userStateKeys.history,
      );

      qc.setQueryData<{ items: ProgressItem[] }>(
        userStateKeys.history,
        (old) => ({
          items: (old?.items ?? []).filter((item) => item.movie_slug !== slug),
        }),
      );

      return { previous };
    },
    onError: (_err, _slug, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(userStateKeys.history, context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: userStateKeys.history });
    },
  });

  return {
    remove: (slug: string) => {
      if (user) {
        serverMutation.mutate(slug);
      } else {
        removeGuestProgress(slug);
      }
    },
    isPending: serverMutation.isPending,
    error: serverMutation.error,
  };
}

// ---------------------------------------------------------------------------
// useSaveProgress — logged in → PUT; guest → store upsert.
// The player throttles calls via shouldThrottleProgressSave at the call site.
// ---------------------------------------------------------------------------
export function useSaveProgress() {
  const { data: user } = useAuth();
  const qc = useQueryClient();
  const upsertGuest = useGuestStore((s) => s.upsertProgress);

  const serverMutation = useMutation({
    mutationFn: (payload: SaveProgressPayload) =>
      userStateApi.saveProgress(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userStateKeys.history });
    },
  });

  return {
    save: (payload: SaveProgressPayload) => {
      if (user) {
        serverMutation.mutate(payload);
      } else {
        upsertGuest({
          movieSlug: payload.slug,
          episodeSlug: payload.episodeSlug,
          serverName: payload.server,
          positionSec: payload.positionSec,
          durationSec: payload.durationSec ?? null,
          movieSnapshot: asRecord(payload.snapshot),
          updatedAt: new Date().toISOString(),
        });
      }
    },
    isPending: serverMutation.isPending,
    error: serverMutation.error,
  };
}
