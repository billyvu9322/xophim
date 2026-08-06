import { useState } from "react";
import { useSearch as useRouterSearch } from "@tanstack/react-router";
import { useSearch as useCatalogSearch } from "@/hooks/catalog";
import { MovieGrid } from "@/components/MovieGrid";
import { Pagination } from "@/components/Pagination";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";

export function SearchPage() {
  const { keyword = "" } = useRouterSearch({ from: "/search" }) as { keyword?: string };

  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useCatalogSearch(keyword, { page });

  // Reset page when keyword changes — derived effect via key prop pattern:
  // parent router controls keyword, page resets automatically because
  // the component remounts when navigating to a new keyword query.

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
      ) : !data || data.items.length === 0 ? (
        <EmptyState label="Không tìm thấy phim nào" />
      ) : (
        <>
          <MovieGrid movies={data.items} />
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onChange={(p) => setPage(p)}
          />
        </>
      )}
    </div>
  );
}
