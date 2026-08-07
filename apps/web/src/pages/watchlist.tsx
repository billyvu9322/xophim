import { useWatchlist } from "@/hooks/user-state";
import { MovieGrid } from "@/components/MovieGrid";
import type { MovieCardData } from "@/components/MovieCard";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { MovieGridSkeleton } from "@/components/ui/skeletons";

export function WatchlistPage() {
  const { items, isLoading, error } = useWatchlist();

  const movies: MovieCardData[] = items.map((it) => ({
    slug: it.movie_slug,
    name: it.movie_snapshot.name,
    posterUrl: it.movie_snapshot.posterUrl,
    year: it.movie_snapshot.year,
  }));

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
      <h1 className="text-2xl font-semibold text-white">Danh Sách Của Tôi</h1>

      {isLoading ? (
        <MovieGridSkeleton />
      ) : error ? (
        <ErrorState />
      ) : movies.length === 0 ? (
        <EmptyState label="Bạn chưa lưu phim nào" />
      ) : (
        <MovieGrid movies={movies} />
      )}
    </div>
  );
}
