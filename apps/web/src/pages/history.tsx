import { useHistory } from "@/hooks/user-state";
import { MovieCard } from "@/components/MovieCard";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { MovieGridSkeleton } from "@/components/ui/skeletons";
import { formatDuration, timeAgo } from "@/lib/format";

export function HistoryPage() {
  const { items, isLoading, error } = useHistory();

  // Sort descending by updated_at (server already returns desc, but guard client-side too).
  const sorted = [...items].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
      <h1 className="text-2xl font-semibold text-white">Lịch Sử Xem</h1>

      {isLoading ? (
        <MovieGridSkeleton />
      ) : error ? (
        <ErrorState />
      ) : sorted.length === 0 ? (
        <EmptyState label="Chưa có lịch sử xem" />
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
          {sorted.map((it) => {
            const progress =
              it.duration_sec != null && it.duration_sec > 0
                ? it.position_sec / it.duration_sec
                : undefined;

            return (
              <div key={it.id}>
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
