import { z } from "zod";

// Validate only the fields the mapper reads; allow the rest through so KKPhim
// adding fields never breaks us. On drift the client logs a warning.
const taxonomy = z
  .object({ name: z.string(), slug: z.string() })
  .passthrough();

const tmdb = z
  .object({ id: z.union([z.string(), z.null()]).optional(), vote_average: z.number().optional() })
  .passthrough();
const imdb = z
  .object({ id: z.union([z.string(), z.null()]).optional(), vote_average: z.number().optional() })
  .passthrough();
const imagePath = z.string().nullable().optional().transform((value) => value ?? "");

export const kkMovieItem = z
  .object({
    slug: z.string(),
    name: z.string(),
    origin_name: z.string().optional().default(""),
    poster_url: imagePath,
    thumb_url: imagePath,
    type: z.string().optional().default(""),
    year: z.number().nullable().optional().default(null),
    quality: z.string().optional().default(""),
    lang: z.string().optional().default(""),
    episode_current: z.string().optional().default(""),
    category: z.array(taxonomy).optional().default([]),
    country: z.array(taxonomy).optional().default([]),
    tmdb: tmdb.optional(),
    imdb: imdb.optional(),
  })
  .passthrough();

const kkPagination = z
  .object({
    totalItems: z.number(),
    currentPage: z.number(),
    totalPages: z.number(),
  })
  .passthrough();

// Wrapper A: /danh-sach/phim-moi-cap-nhat* — image base path + top-level pagination.
export const kkLatestResponse = z
  .object({
    items: z.array(kkMovieItem),
    pathImage: z.string().url().default("https://phimapi.com/uploads/movies/"),
    pagination: kkPagination,
  })
  .passthrough();

// Wrapper B: /v1/api/* — relative images, data.params.pagination, CDN domain.
export const kkV1ListResponse = z
  .object({
    data: z
      .object({
        items: z.array(kkMovieItem),
        params: z.object({ pagination: kkPagination }).passthrough(),
        APP_DOMAIN_CDN_IMAGE: z.string().optional().default("https://phimimg.com"),
      })
      .passthrough(),
  })
  .passthrough();

const kkServerData = z
  .object({
    name: z.string().optional().default(""),
    slug: z.string().optional().default(""),
    link_embed: z.string().optional().default(""),
    link_m3u8: z.string().optional().default(""),
  })
  .passthrough();

const kkEpisodeServer = z
  .object({
    server_name: z.string().optional().default(""),
    server_data: z.array(kkServerData).optional().default([]),
  })
  .passthrough();

export const kkDetailResponse = z
  .object({
    movie: kkMovieItem
      .extend({
        content: z.string().optional().default(""),
        status: z.string().optional().default(""),
        episode_total: z.union([z.number(), z.string()]).optional().default(0),
        trailer_url: z.string().nullable().optional().default(null),
        actor: z.array(z.string()).optional().default([]),
        director: z.array(z.string()).optional().default([]),
        time: z.string().optional().default(""),
      })
      .passthrough(),
    episodes: z.array(kkEpisodeServer).optional().default([]),
  })
  .passthrough();

// Taxonomy list: /the-loai and /quoc-gia — { data: { items: [{name,slug}] } }.
export const kkTaxonomyResponse = z
  .object({ data: z.object({ items: z.array(taxonomy) }).passthrough() })
  .passthrough();

export type KkMovieItem = z.infer<typeof kkMovieItem>;
export type KkV1ListResponse = z.infer<typeof kkV1ListResponse>;
export type KkLatestResponse = z.infer<typeof kkLatestResponse>;
export type KkDetailResponse = z.infer<typeof kkDetailResponse>;
export type KkTaxonomyResponse = z.infer<typeof kkTaxonomyResponse>;
