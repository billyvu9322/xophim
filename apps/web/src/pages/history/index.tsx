import { X } from "lucide-react";
import { useDeleteHistory, useHistory } from "@/hooks/user-state";
import { MovieCard } from "@/components/MovieCard";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { MovieGridSkeleton } from "@/components/ui/skeletons";
import { formatDuration, timeAgo } from "@/lib/format";

export function HistoryPage() {
  const { items, isLoading, error } = useHistory();
  const deleteHistory = useDeleteHistory();

  // ONE card per movie: history has a row per (movie, episode), but we only
  // want the most recently watched episode of each movie. Sort newest-first,
  // then keep the first row seen per movie slug.
  const seen = new Set<string>();
  const movies = [...items]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .filter((it) => {
      if (seen.has(it.movie_slug)) return false;
      seen.add(it.movie_slug);
      return true;
    });

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
      <h1 className="text-2xl font-semibold text-white">Lịch Sử Xem</h1>

      {isLoading ? (
        <MovieGridSkeleton />
      ) : error ? (
        <ErrorState />
      ) : movies.length === 0 ? (
        <EmptyState label="Chưa có lịch sử xem" />
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
          {movies.map((it) => {
            const progress =
              it.duration_sec != null && it.duration_sec > 0
                ? it.position_sec / it.duration_sec
                : undefined;

            return (
              <div key={it.movie_slug} className="group relative">
                <MovieCard
                  movie={{
                    slug: it.movie_slug,
                    name: it.movie_snapshot.name,
                    posterUrl: it.movie_snapshot.posterUrl,
                    year: it.movie_snapshot.year,
                  }}
                  progress={progress}
                  episodeSlug={it.episode_slug}
                  resumeLabel={`${resumeEpisodeLabel(it.episode_slug)} • ${formatDuration(it.position_sec)}`}
                />
                <button
                  type="button"
                  aria-label={`Xóa ${it.movie_snapshot.name} khỏi lịch sử`}
                  title="Xóa khỏi lịch sử"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    deleteHistory.remove(it.movie_slug);
                  }}
                  className="absolute right-1.5 top-1.5 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white opacity-0 shadow-lg shadow-black/40 ring-1 ring-white/15 backdrop-blur transition hover:bg-danger hover:text-white group-hover:opacity-100 focus:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
                <p className="mt-1 text-xs text-muted">
                  {timeAgo(it.updated_at)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function resumeEpisodeLabel(episodeSlug: string): string {
  if (episodeSlug === "full") return "Full";
  const episode = episodeSlug.match(/(?:tap-|episode-)?(\d+)$/i)?.[1];
  return episode ? `Tập ${episode}` : episodeSlug;
}
