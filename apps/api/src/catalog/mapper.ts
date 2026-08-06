import type {
  KkDetailResponse,
  KkMovieItem,
  KkV1ListResponse,
} from "./kkphim.schemas.js";
import type {
  XoMovie,
  XoMovieDetail,
  XoPaged,
  XoScore,
  XoTaxonomy,
} from "./types.js";

export function absoluteImage(url: string, cdn: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${cdn}/${url.replace(/^\/+/, "")}`;
}

function score(raw: KkMovieItem): XoScore {
  const imdb = raw.imdb?.vote_average ?? 0;
  const tmdb = raw.tmdb?.vote_average ?? 0;
  return { imdb: imdb > 0 ? imdb : null, tmdb: tmdb > 0 ? tmdb : null };
}

function taxonomy(list: { name: string; slug: string }[] | undefined): XoTaxonomy[] {
  return (list ?? []).map((t) => ({ name: t.name, slug: t.slug }));
}

export function mapMovieItem(raw: KkMovieItem, cdn: string): XoMovie {
  return {
    slug: raw.slug,
    name: raw.name,
    originName: raw.origin_name ?? "",
    posterUrl: absoluteImage(raw.poster_url ?? "", cdn),
    thumbUrl: absoluteImage(raw.thumb_url ?? "", cdn),
    type: raw.type ?? "",
    year: raw.year ?? null,
    quality: raw.quality ?? "",
    lang: raw.lang ?? "",
    episodeCurrent: raw.episode_current ?? "",
    categories: taxonomy(raw.category),
    countries: taxonomy(raw.country),
    score: score(raw),
  };
}

export function mapV1List(resp: KkV1ListResponse): XoPaged<XoMovie> {
  const cdn = resp.data.APP_DOMAIN_CDN_IMAGE ?? "https://phimimg.com";
  const p = resp.data.params.pagination;
  return {
    items: resp.data.items.map((it) => mapMovieItem(it, cdn)),
    pagination: { page: p.currentPage, totalPages: p.totalPages, totalItems: p.totalItems },
  };
}

export function mapDetail(resp: KkDetailResponse): XoMovieDetail {
  const cdn = "https://phimimg.com"; // detail already returns absolute; harmless fallback.
  const base = mapMovieItem(resp.movie, cdn);
  const m = resp.movie;
  return {
    ...base,
    content: m.content ?? "",
    status: m.status ?? "",
    episodeTotal: Number(m.episode_total ?? 0),
    trailerUrl: m.trailer_url ?? null,
    actors: m.actor ?? [],
    directors: m.director ?? [],
    time: m.time ?? "",
    episodes: (resp.episodes ?? []).map((s) => ({
      serverName: s.server_name ?? "",
      items: (s.server_data ?? []).map((d) => ({
        name: d.name ?? "",
        slug: d.slug ?? "",
        linkEmbed: d.link_embed ?? "",
        linkM3u8: d.link_m3u8 ?? "",
      })),
    })),
  };
}
