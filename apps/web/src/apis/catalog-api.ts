import { api } from "./api";
import type {
  DetailData,
  FiltersData,
  HomeData,
  Movie,
  Paged,
  Taxonomy,
} from "./types/catalog-types";

export interface ListParams {
  page?: number;
  limit?: number;
  sort_field?: "modified.time" | "_id" | "year";
  sort_type?: "asc" | "desc";
  sort_lang?: "vietsub" | "thuyet-minh" | "long-tieng";
  category?: string;
  country?: string;
  /** Single year or comma-separated years ("2020,2021") for multi-select. */
  year?: string;
}

const get = async <T>(url: string, params?: object): Promise<T> => {
  const res = await api.get<T>(url, { params });
  return res.data;
};

export const catalogApi = {
  home: () => get<HomeData>("/catalog/home"),
  detail: (slug: string) => get<DetailData>(`/catalog/detail/${slug}`),
  list: (type: string, params: ListParams) =>
    get<Paged<Movie>>(`/catalog/list/${type}`, params),
  category: (slug: string, params: ListParams) =>
    get<Paged<Movie>>(`/catalog/category/${slug}`, params),
  country: (slug: string, params: ListParams) =>
    get<Paged<Movie>>(`/catalog/country/${slug}`, params),
  year: (year: number, params: ListParams) =>
    get<Paged<Movie>>(`/catalog/year/${year}`, params),
  search: (keyword: string, params: ListParams) =>
    get<Paged<Movie>>("/catalog/search", { keyword, ...params }),
  categories: () => get<Taxonomy[]>("/catalog/categories"),
  countries: () => get<Taxonomy[]>("/catalog/countries"),
  filters: () => get<FiltersData>("/catalog/filters"),
};
