import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { catalogApi, type ListParams } from "@/apis/catalog-api";

export const catalogKeys = {
  home: ["catalog", "home"] as const,
  detail: (slug: string) => ["catalog", "detail", slug] as const,
  list: (type: string, p: ListParams) => ["catalog", "list", type, p] as const,
  category: (slug: string, p: ListParams) => ["catalog", "category", slug, p] as const,
  country: (slug: string, p: ListParams) => ["catalog", "country", slug, p] as const,
  year: (year: number, p: ListParams) => ["catalog", "year", year, p] as const,
  search: (kw: string, p: ListParams) => ["catalog", "search", kw, p] as const,
  filters: ["catalog", "filters"] as const,
};

const FIVE_MIN = 5 * 60_000;

export const useHome = () =>
  useQuery({ queryKey: catalogKeys.home, queryFn: catalogApi.home, staleTime: FIVE_MIN });

export const useMovieDetail = (slug: string) =>
  useQuery({
    queryKey: catalogKeys.detail(slug),
    queryFn: () => catalogApi.detail(slug),
    enabled: !!slug,
    staleTime: FIVE_MIN,
  });

export const useMovieList = (
  type: string,
  params: ListParams,
  enabled = true,
) =>
  useQuery({
    queryKey: catalogKeys.list(type, params),
    queryFn: () => catalogApi.list(type, params),
    enabled,
    staleTime: FIVE_MIN,
    // Keep the previous page's results on screen while the next page loads, so
    // paging/filtering holds the grid instead of flashing a skeleton.
    placeholderData: keepPreviousData,
  });

// IMDb sort has NO server support on KKPhim (list sort_field is only
// modified.time/_id/year). So we fetch a bounded pool of the freshest matching
// movies, sort the WHOLE pool by IMDb once, and paginate it client-side — giving
// a stable, monotonic ranking instead of the per-page re-sort bug. The pool is
// capped (can't pull the entire multi-thousand catalog), so it ranks within the
// most recent IMDB_POOL_PAGES × 64 matches, not literally every movie.
const IMDB_POOL_PAGES = 5;
const IMDB_POOL_LIMIT = 64;
export const IMDB_POOL_SIZE = IMDB_POOL_PAGES * IMDB_POOL_LIMIT;

export const useImdbSortedList = (
  type: string,
  params: Omit<ListParams, "page" | "limit" | "sort_field" | "sort_type">,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ["catalog", "imdb-sorted", type, params] as const,
    enabled,
    staleTime: FIVE_MIN,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const pages = await Promise.all(
        Array.from({ length: IMDB_POOL_PAGES }, (_, i) =>
          catalogApi
            .list(type, {
              ...params,
              page: i + 1,
              limit: IMDB_POOL_LIMIT,
              sort_field: "modified.time",
              sort_type: "desc",
            })
            .catch(() => null),
        ),
      );
      const seen = new Set<string>();
      const items = pages
        .flatMap((p) => p?.items ?? [])
        .filter((m) => (seen.has(m.slug) ? false : (seen.add(m.slug), true)));
      items.sort(
        (a, b) =>
          (b.score?.imdb ?? 0) - (a.score?.imdb ?? 0) ||
          a.slug.localeCompare(b.slug),
      );
      return items;
    },
  });

export const useInfiniteMovieList = (type: string, params: Omit<ListParams, "page">) =>
  useInfiniteQuery({
    queryKey: catalogKeys.list(type, params),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => catalogApi.list(type, { ...params, page: pageParam }),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    staleTime: FIVE_MIN,
    placeholderData: keepPreviousData,
  });

export const useInfiniteCountryList = (
  slug: string,
  params: Omit<ListParams, "page">,
) =>
  useInfiniteQuery({
    queryKey: catalogKeys.country(slug, params),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      catalogApi.country(slug, { ...params, page: pageParam }),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    staleTime: FIVE_MIN,
    placeholderData: keepPreviousData,
  });

export const useSearch = (keyword: string, params: ListParams) =>
  useQuery({
    queryKey: catalogKeys.search(keyword, params),
    queryFn: () => catalogApi.search(keyword, params),
    enabled: keyword.trim().length > 0,
    staleTime: FIVE_MIN,
    placeholderData: keepPreviousData,
  });

export const useInfiniteSearch = (keyword: string, params: Omit<ListParams, "page">) =>
  useInfiniteQuery({
    queryKey: catalogKeys.search(keyword, params),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => catalogApi.search(keyword, { ...params, page: pageParam }),
    enabled: keyword.trim().length > 0,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    staleTime: FIVE_MIN,
    placeholderData: keepPreviousData,
  });

export const useFilters = () =>
  useQuery({
    queryKey: catalogKeys.filters,
    queryFn: catalogApi.filters,
    staleTime: 24 * 60 * 60_000,
  });
