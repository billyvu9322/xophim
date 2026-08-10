import { useSearch as useRouterSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { InfiniteMovieGrid } from "@/components/InfiniteMovieGrid";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { MovieGridSkeleton } from "@/components/ui/skeletons";
import { useInfiniteSearch } from "@/hooks/catalog";
import type { ListParams } from "@/lib/catalog-api";

export function SearchPage() {
  const { keyword = "" } = useRouterSearch({ from: "/search" }) as {
    keyword?: string;
  };

  const params: Omit<ListParams, "page"> = {
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
  } = useInfiniteSearch(keyword, params);

  // Dedupe by slug (overlapping pages) — see browse.tsx.
  const movies = useMemo(() => {
    const all = data?.pages.flatMap((p) => p.items) ?? [];
    const seen = new Set<string>();
    return all.filter((m) => (seen.has(m.slug) ? false : (seen.add(m.slug), true)));
  }, [data]);

  if (!keyword) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
        <EmptyState label="Nhập từ khóa để tìm kiếm" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
      <h1 className="text-2xl font-semibold text-white">
        Kết quả cho: <span className="text-gold">{keyword}</span>
      </h1>

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
