import { X } from "lucide-react";
import { MovieCard } from "@/components/MovieCard";
import { useDeleteHistory, useHistory } from "@/hooks/user-state";

export function ContinueWatching() {
  const { items: history } = useHistory();
  const deleteHistory = useDeleteHistory();

  // Continue-watching = ONE card per movie (the most recently watched episode).
  // History has a row per (movie, episode); dedupe by slug keeping the latest so
  // a movie watched across 2 episodes doesn't show up twice.
  const seenSlugs = new Set<string>();
  const continueWatching = [...history]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .filter((h) => {
      if (seenSlugs.has(h.movie_slug)) return false;
      seenSlugs.add(h.movie_slug);
      return true;
    })
    .slice(0, 12)
    .map((h) => ({
      slug: h.movie_slug,
      name: h.movie_snapshot.name,
      posterUrl: h.movie_snapshot.posterUrl,
      year: h.movie_snapshot.year,
      episodeSlug: h.episode_slug,
      progress: h.duration_sec ? h.position_sec / h.duration_sec : 0,
      // resumeLabel: `${resumeEpisodeLabel(h.episode_slug)} • ${formatDuration(h.position_sec)}`,
    }));

  if (continueWatching.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">Xem Tiếp</h2>
      <div className="no-scrollbar -mx-4 -mt-4 flex gap-3 overflow-x-auto px-4 pb-2 pt-4">
        {continueWatching.map((m) => (
          <div
            key={m.slug}
            className="group relative w-[140px] shrink-0 sm:w-[160px]"
          >
            <MovieCard
              movie={m}
              progress={m.progress}
              episodeSlug={m.episodeSlug}
              // resumeLabel={m.resumeLabel}
            />
            <button
              type="button"
              aria-label={`Xóa ${m.name} khỏi Xem Tiếp`}
              title="Xóa khỏi Xem Tiếp"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                deleteHistory.remove(m.slug);
              }}
              className="absolute right-[-15px] top-[-15px] z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white opacity-0 shadow-lg shadow-black/40 ring-1 ring-white/15 backdrop-blur transition hover:bg-danger hover:text-white group-hover:opacity-100 focus:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
