import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { MovieGrid } from "@/components/MovieGrid";
import { Pagination } from "@/components/Pagination";
import {
  MovieFilter,
  SORT_OPTIONS,
  type FilterValue,
} from "@/components/MovieFilter";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { MovieGridSkeleton } from "@/components/ui/skeletons";
import { useMovieList, useFilters } from "@/hooks/catalog";
import type { ListParams } from "@/lib/catalog-api";

// The dedicated filter page keeps its whole state in the URL so results are
// shareable and survive reload / back. Multi-selects are stored comma-joined.
export interface FilterSearch {
  type: string;
  country: string;
  category: string;
  year: string;
  lang: string;
  sort: number;
  page: number;
}

export function validateFilterSearch(s: Record<string, unknown>): FilterSearch {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    type: str(s.type) || "phim-moi",
    country: str(s.country),
    category: str(s.category),
    year: str(s.year),
    lang: str(s.lang),
    sort: s.sort != null ? Number(s.sort) || 0 : 0,
    page: s.page != null ? Math.max(1, Number(s.page) || 1) : 1,
  };
}

export function FilterPage() {
  const search = useSearch({ from: "/loc" });
  const navigate = useNavigate();
  const { data: filters } = useFilters();

  // URL search → FilterValue for the MovieFilter panel.
  const filter: FilterValue = useMemo(
    () => ({
      type: search.type,
      country: search.country ? search.country.split(",") : [],
      category: search.category ? search.category.split(",") : [],
      year: search.year
        ? search.year.split(",").map(Number).filter(Boolean)
        : [],
      lang: search.lang,
      sortIdx: search.sort,
    }),
    [search],
  );

  const sortOpt = SORT_OPTIONS[filter.sortIdx] ?? SORT_OPTIONS[0];

  const params: ListParams = {
    page: search.page,
    // 28 = 4 full rows on the 7-col desktop grid (default 24 leaves a short
    // last row of 3). The grid still wraps cleanly at smaller breakpoints.
    limit: 28,
    sort_field: sortOpt.field,
    sort_type: sortOpt.type,
    ...(filter.category.length ? { category: filter.category.join(",") } : {}),
    ...(filter.country.length ? { country: filter.country.join(",") } : {}),
    ...(filter.year.length ? { year: filter.year.join(",") } : {}),
    ...(filter.lang
      ? { sort_lang: filter.lang as ListParams["sort_lang"] }
      : {}),
  };

  const { data, isLoading, isError } = useMovieList(filter.type, params);

  // "Điểm IMDb" has no server sort — order the current page client-side (stable
  // via slug tiebreaker). With server paging it only sorts within a page.
  const movies = useMemo(() => {
    const items = data?.items ?? [];
    if (!sortOpt.imdb) return items;
    return [...items].sort(
      (a, b) =>
        (b.score?.imdb ?? 0) - (a.score?.imdb ?? 0) ||
        a.slug.localeCompare(b.slug),
    );
  }, [data, sortOpt.imdb]);

  const page = data?.pagination.page ?? search.page;
  const totalPages = data?.pagination.totalPages ?? 1;

  // Applying filters resets to page 1; paging keeps the rest of the search.
  function onApply(v: FilterValue) {
    void navigate({
      to: "/loc",
      search: {
        type: v.type,
        country: v.country.join(","),
        category: v.category.join(","),
        year: v.year.join(","),
        lang: v.lang,
        sort: v.sortIdx,
        page: 1,
      },
    });
  }

  function goPage(p: number) {
    void navigate({ to: "/loc", search: { ...search, page: p } });
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6">
      <h1 className="text-2xl font-semibold text-white">Lọc Phim</h1>

      <MovieFilter
        filters={filters}
        value={filter}
        onApply={onApply}
        showType
        defaultOpen
      />

      {isLoading ? (
        <MovieGridSkeleton />
      ) : isError ? (
        <ErrorState />
      ) : movies.length === 0 ? (
        <EmptyState label="Không tìm thấy phim nào" />
      ) : (
        <>
          <MovieGrid movies={movies} />
          <Pagination page={page} totalPages={totalPages} onChange={goPage} />
        </>
      )}
    </div>
  );
}
