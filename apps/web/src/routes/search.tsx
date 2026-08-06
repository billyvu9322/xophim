import { useSearch as useRouterSearch } from "@tanstack/react-router";
import { InfiniteMovieGrid } from "@/components/InfiniteMovieGrid";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { useInfiniteSearch } from "@/hooks/catalog";

export function SearchPage() {
  const { keyword = "" } = useRouterSearch({ from: "/search" }) as { keyword?: string };

  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteSearch(keyword, {});
  const movies = data?.pages.flatMap((pageData) => pageData.items) ?? [];

  if (!keyword) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
        <EmptyState label="Nhập từ khóa để tìm kiếm" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
      {/* Heading */}
      <h1 className="text-2xl font-semibold text-white">
        Kết quả cho:{" "}
        <span className="text-gold">{keyword}</span>
      </h1>

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState />
      ) : movies.length === 0 ? (
        <EmptyState label="Không tìm thấy phim nào" />
      ) : (
        <InfiniteMovieGrid
          movies={movies}
          hasMore={Boolean(hasNextPage)}
          isLoadingMore={isFetchingNextPage}
          loadMore={() => void fetchNextPage()}
        />
      )}
    </div>
  );
}
