import { env } from "../config/env.js";
import { KkphimClient } from "./kkphimClient.js";
import {
  kkDetailResponse,
  kkLatestResponse,
  kkTaxonomyResponse,
  kkV1ListResponse,
} from "./kkphim.schemas.js";
import { mapDetail, mapMovieItem, mapV1List } from "./mapper.js";
import type { XoMovie, XoMovieDetail, XoPaged, XoTaxonomy } from "./types.js";

const TTL = { list: 5 * 60_000, detail: 10 * 60_000, taxonomy: 24 * 60 * 60_000 };

export interface ListQuery {
  page?: number;
  limit?: number;
  sort_field?: string;
  sort_type?: string;
  sort_lang?: string;
  category?: string;
  country?: string;
  year?: string;
}

function qs(query: Record<string, string | number | undefined>): string {
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export class CatalogService {
  constructor(private readonly client: KkphimClient) {}

  private async v1List(path: string, q: ListQuery): Promise<XoPaged<XoMovie>> {
    const resp = await this.client.get(`${path}${qs({ ...q })}`, kkV1ListResponse, TTL.list);
    return mapV1List(resp);
  }

  list(type: string, q: ListQuery) {
    return this.v1List(`/v1/api/danh-sach/${type}`, q);
  }
  category(slug: string, q: ListQuery) {
    return this.v1List(`/v1/api/the-loai/${slug}`, q);
  }
  country(slug: string, q: ListQuery) {
    return this.v1List(`/v1/api/quoc-gia/${slug}`, q);
  }
  year(year: number, q: ListQuery) {
    return this.v1List(`/v1/api/nam/${year}`, q);
  }
  search(keyword: string, q: ListQuery) {
    return this.v1List(`/v1/api/tim-kiem`, { ...q, keyword } as ListQuery & { keyword: string });
  }

  async detail(slug: string): Promise<{ movie: XoMovieDetail; similar: XoMovie[] }> {
    const resp = await this.client.get(`/phim/${slug}`, kkDetailResponse, TTL.detail);
    const movie = mapDetail(resp);
    const firstCat = movie.categories[0]?.slug;
    let similar: XoMovie[] = [];
    if (firstCat) {
      try {
        const paged = await this.category(firstCat, { limit: 12 });
        similar = paged.items.filter((m) => m.slug !== movie.slug).slice(0, 10);
      } catch {
        similar = [];
      }
    }
    return { movie, similar };
  }

  async latest(page: number): Promise<XoPaged<XoMovie>> {
    const resp = await this.client.get(
      `/danh-sach/phim-moi-cap-nhat-v3?page=${page}`,
      kkLatestResponse,
      TTL.list,
    );
    return {
      items: resp.items.map((it) => mapMovieItem(it, resp.pathImage)),
      pagination: {
        page: resp.pagination.currentPage,
        totalPages: resp.pagination.totalPages,
        totalItems: resp.pagination.totalItems,
      },
    };
  }

  private async taxonomy(path: string): Promise<XoTaxonomy[]> {
    const resp = await this.client.get(path, kkTaxonomyResponse, TTL.taxonomy);
    return resp.data.items.map((t) => ({ name: t.name, slug: t.slug }));
  }
  categories() {
    return this.taxonomy("/the-loai");
  }
  countries() {
    return this.taxonomy("/quoc-gia");
  }

  async home(): Promise<{
    latest: XoMovie[];
    phimBo: XoMovie[];
    phimLe: XoMovie[];
    hoatHinh: XoMovie[];
    phimHan: XoMovie[];
    phimTrung: XoMovie[];
  }> {
    const [latest, phimBo, phimLe, hoatHinh, phimHan, phimTrung] =
      await Promise.all([
        this.latest(1),
        this.list("phim-bo", { limit: 12 }),
        this.list("phim-le", { limit: 12 }),
        this.list("hoat-hinh", { limit: 12 }),
        this.country("han-quoc", { limit: 12 }),
        this.country("trung-quoc", { limit: 12 }),
      ]);
    return {
      latest: latest.items,
      phimBo: phimBo.items,
      phimLe: phimLe.items,
      hoatHinh: hoatHinh.items,
      phimHan: phimHan.items,
      phimTrung: phimTrung.items,
    };
  }
}

// Singleton wired to configured env, decorated onto the app in routes.ts.
export const catalogService = new CatalogService(
  new KkphimClient({ baseUrl: env.KKPHIM_BASE_URL }),
);
