import { useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { InfiniteMovieGrid } from "@/components/InfiniteMovieGrid";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { MovieGridSkeleton } from "@/components/ui/skeletons";
import { useInfiniteMovieList } from "@/hooks/catalog";
import type { ListParams } from "@/lib/catalog-api";

// Map URL type slug → Vietnamese display title
const TYPE_LABELS: Record<string, string> = {
  "phim-bo": "Phim Bộ",
  "phim-le": "Phim Lẻ",
  "hoat-hinh": "Hoạt Hình",
  "tv-shows": "TV Shows",
  "phim-moi": "Phim Mới Cập Nhật",
};

export function BrowsePage() {
  const { type } = useParams({ from: "/list/$type" });

  const listParams: Omit<ListParams, "page"> = {
    sort_field: "modified.time",
    sort_type: "desc",
  };

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteMovieList(type, listParams);

  // Dedupe by slug — KKPhim's modified.time pagination can return the same movie
  // on consecutive pages, which duplicates React keys and makes the grid jump on
  // load-more.
  const movies = useMemo(() => {
    const all = data?.pages.flatMap((p) => p.items) ?? [];
    const seen = new Set<string>();
    return all.filter((m) => (seen.has(m.slug) ? false : (seen.add(m.slug), true)));
  }, [data]);

  const title = TYPE_LABELS[type] ?? type;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>

      {isLoading ? (
        <MovieGridSkeleton />
      ) : isError ? (
        <ErrorState />
      ) : movies.length === 0 ? (
        <EmptyState label="Không tìm thấy phim nào" />
      ) : (
        <InfiniteMovieGrid
          movies={movies}
          hasMore={Boolean(hasNextPage)}
          loadMore={() => void fetchNextPage()}
          isFetching={isFetchingNextPage}
        />
      )}
    </div>
  );
}
