import { useQuery } from "@tanstack/react-query";
import { catalogApi, type ListParams } from "../lib/catalog-api";

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

export const useMovieList = (type: string, params: ListParams) =>
  useQuery({
    queryKey: catalogKeys.list(type, params),
    queryFn: () => catalogApi.list(type, params),
    staleTime: FIVE_MIN,
  });

export const useSearch = (keyword: string, params: ListParams) =>
  useQuery({
    queryKey: catalogKeys.search(keyword, params),
    queryFn: () => catalogApi.search(keyword, params),
    enabled: keyword.trim().length > 0,
    staleTime: FIVE_MIN,
  });

export const useFilters = () =>
  useQuery({
    queryKey: catalogKeys.filters,
    queryFn: catalogApi.filters,
    staleTime: 24 * 60 * 60_000,
  });
