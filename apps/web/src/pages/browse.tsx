import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { InfiniteMovieGrid } from "@/components/InfiniteMovieGrid";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { MovieGridSkeleton } from "@/components/ui/skeletons";
import { useInfiniteMovieList, useFilters } from "@/hooks/catalog";
import { cn } from "@/lib/utils";
import type { ListParams } from "@/lib/catalog-api";

// Map URL type slug → Vietnamese display title
const TYPE_LABELS: Record<string, string> = {
  "phim-bo": "Phim Bộ",
  "phim-le": "Phim Lẻ",
  "hoat-hinh": "Hoạt Hình",
  "tv-shows": "TV Shows",
  "phim-moi": "Phim Mới Cập Nhật",
};

type SortOption = {
  label: string;
  field: ListParams["sort_field"];
  type: ListParams["sort_type"];
};

const SORT_OPTIONS: SortOption[] = [
  { label: "Mới nhất", field: "modified.time", type: "desc" },
  { label: "Năm", field: "year", type: "desc" },
  { label: "Tên A–Z", field: "_id", type: "asc" },
];

const selectClass =
  "rounded-md bg-elevated px-3 py-2 text-sm text-silver appearance-none cursor-pointer border border-slate/40 focus:outline-none focus:ring-2 focus:ring-gold hover:bg-chip transition-colors";

export function BrowsePage() {
  const { type } = useParams({ from: "/list/$type" });

  const [category, setCategory] = useState("");
  const [country, setCountry] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [sortIdx, setSortIdx] = useState(0);

  const { data: filters } = useFilters();

  const sortOpt = SORT_OPTIONS[sortIdx] ?? SORT_OPTIONS[0]!;

  const listParams: ListParams = {
    sort_field: sortOpt.field,
    sort_type: sortOpt.type,
    ...(category ? { category } : {}),
    ...(country ? { country } : {}),
    ...(year !== "" ? { year } : {}),
  };

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteMovieList(type, listParams);
  const movies = data?.pages.flatMap((pageData) => pageData.items) ?? [];

  const title = TYPE_LABELS[type] ?? type;

  function resetFilters() {
    setCategory("");
    setCountry("");
    setYear("");
    setSortIdx(0);
  }

  function handleCategory(val: string) {
    setCategory(val);
  }
  function handleCountry(val: string) {
    setCountry(val);
  }
  function handleYear(val: string) {
    setYear(val === "" ? "" : Number(val));
  }
  function handleSort(val: string) {
    setSortIdx(Number(val));
  }

  const hasActiveFilter =
    category !== "" || country !== "" || year !== "" || sortIdx !== 0;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
      {/* Page heading */}
      <h1 className="text-2xl font-semibold text-white">{title}</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Thể Loại */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Thể Loại</label>
          <select
            className={selectClass}
            value={category}
            onChange={(e) => handleCategory(e.target.value)}
          >
            <option value="">Tất cả</option>
            {filters?.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Quốc Gia */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Quốc Gia</label>
          <select
            className={selectClass}
            value={country}
            onChange={(e) => handleCountry(e.target.value)}
          >
            <option value="">Tất cả</option>
            {filters?.countries.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Năm */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Năm</label>
          <select
            className={selectClass}
            value={year === "" ? "" : String(year)}
            onChange={(e) => handleYear(e.target.value)}
          >
            <option value="">Tất cả</option>
            {filters?.years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Sắp Xếp */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Sắp Xếp</label>
          <select
            className={selectClass}
            value={String(sortIdx)}
            onChange={(e) => handleSort(e.target.value)}
          >
            {SORT_OPTIONS.map((opt, idx) => (
              <option key={idx} value={String(idx)}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Xóa Lọc */}
        {hasActiveFilter && (
          <button
            onClick={resetFilters}
            className={cn(
              "mt-5 rounded-md bg-chip px-4 py-2 text-sm font-medium text-silver",
              "hover:bg-elevated hover:text-white transition-colors",
            )}
          >
            Xóa Lọc
          </button>
        )}
      </div>

      {/* Content */}
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
        />
      )}
    </div>
  );
}
