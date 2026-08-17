import { env } from "../config/env.js";
import { catalogService } from "../catalog/service.js";
import type { SeoMeta } from "./head.js";

const SITE = env.SITE_URL;
const SITE_NAME = "XoPhim";
const DEFAULT_DESC =
  "XoPhim — xem phim online miễn phí chất lượng cao: phim bộ, phim lẻ, hoạt hình, phim Hàn, phim Trung, Vietsub & thuyết minh, cập nhật mỗi ngày.";

// URL type slug → Vietnamese label (mirrors the web BrowsePage map).
const TYPE_LABELS: Record<string, string> = {
  "phim-bo": "Phim Bộ",
  "phim-le": "Phim Lẻ",
  "hoat-hinh": "Hoạt Hình",
  "tv-shows": "TV Shows",
  "phim-moi": "Phim Mới Cập Nhật",
  "phim-vietsub": "Phim Vietsub",
  "phim-thuyet-minh": "Phim Thuyết Minh",
  "phim-long-tieng": "Phim Lồng Tiếng",
};

// Known country slugs → display title (mirrors the web CountryBrowsePage).
const COUNTRY_LABELS: Record<string, string> = {
  "han-quoc": "Phim Hàn Quốc",
  "trung-quoc": "Phim Trung Quốc",
};

function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Client route prefixes that must never be indexed (auth / personal / ephemeral).
const NOINDEX_PREFIXES = [
  "/dang-nhap",
  "/dang-ky",
  "/tai-khoan",
  "/danh-sach",
  "/lich-su",
  "/xem-chung",
  "/dashboard",
  "/search",
];

const abs = (path: string) => `${SITE}${path.startsWith("/") ? path : `/${path}`}`;

// Strip HTML tags + collapse whitespace, then clip to a meta-description length.
function plain(text: string, max = 160): string {
  const clean = text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function baseMeta(): SeoMeta {
  return {
    title: `${SITE_NAME} — Xem phim online miễn phí, chất lượng cao`,
    description: DEFAULT_DESC,
    canonical: abs("/"),
    image: abs("/favicon.svg"),
    ogType: "website",
  };
}

function orgAndSiteJsonLd(): Record<string, unknown>[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE,
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE}/search?keyword={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];
}

// Build the SEO head for a given SPA path. `path` is the URL pathname (no query).
// Async because the movie-detail route fetches catalog data (cached upstream) to
// produce a rich title + schema.org Movie JSON-LD.
export async function buildMeta(path: string): Promise<SeoMeta> {
  const clean = decodeURIComponent(path.split("?")[0] ?? "/").replace(
    /\/+$/,
    "",
  ) || "/";

  if (NOINDEX_PREFIXES.some((p) => clean === p || clean.startsWith(`${p}/`))) {
    return { ...baseMeta(), canonical: abs(clean), noindex: true };
  }

  // Home
  if (clean === "/") {
    return { ...baseMeta(), jsonLd: orgAndSiteJsonLd() };
  }

  // Movie detail — the highest-value SEO page.
  const watch = clean.match(/^\/xem\/([^/]+)$/);
  if (watch?.[1]) {
    return detailMeta(watch[1]);
  }

  // Category / type listing
  const list = clean.match(/^\/list\/([^/]+)$/);
  if (list?.[1]) {
    const label = TYPE_LABELS[list[1]] ?? list[1];
    return {
      title: `${label} — Xem online miễn phí | ${SITE_NAME}`,
      description: `Tuyển tập ${label} hay nhất, cập nhật liên tục, chất lượng cao Vietsub & thuyết minh tại ${SITE_NAME}.`,
      canonical: abs(clean),
      image: abs("/favicon.svg"),
      ogType: "website",
    };
  }

  // Country listing (/quoc-gia/:slug) — dedicated SEO landing per country.
  const country = clean.match(/^\/quoc-gia\/([^/]+)$/);
  if (country?.[1]) {
    const label = COUNTRY_LABELS[country[1]] ?? `Phim ${prettifySlug(country[1])}`;
    return {
      title: `${label} — Xem online miễn phí | ${SITE_NAME}`,
      description: `Tuyển tập ${label.toLowerCase()} hay nhất, cập nhật liên tục, chất lượng cao Vietsub & thuyết minh tại ${SITE_NAME}.`,
      canonical: abs(clean),
      image: abs("/favicon.svg"),
      ogType: "website",
    };
  }

  // Filter page — indexable landing but query-driven, canonical to the bare path.
  if (clean === "/filter") {
    return {
      title: `Lọc phim theo thể loại, quốc gia, năm | ${SITE_NAME}`,
      description: `Bộ lọc phim theo thể loại, quốc gia, năm phát hành và chất lượng — tìm nhanh phim bạn muốn xem tại ${SITE_NAME}.`,
      canonical: abs("/filter"),
      image: abs("/favicon.svg"),
    };
  }

  // Collections
  if (clean === "/chu-de" || clean.startsWith("/chu-de/")) {
    return {
      title: `Chủ đề phim tuyển chọn | ${SITE_NAME}`,
      description: `Các bộ sưu tập, chủ đề phim tuyển chọn theo tâm trạng và sở thích tại ${SITE_NAME}.`,
      canonical: abs(clean),
      image: abs("/favicon.svg"),
    };
  }

  // Unknown public route → site default, still indexable.
  return { ...baseMeta(), canonical: abs(clean) };
}

async function detailMeta(slug: string): Promise<SeoMeta> {
  try {
    const { movie } = await catalogService.detail(slug);
    const canonical = abs(`/xem/${slug}`);
    const yearPart = movie.year ? ` (${movie.year})` : "";
    const titleName = movie.name || movie.originName || slug;
    const title = `${titleName}${yearPart} - Xem phim Vietsub online | ${SITE_NAME}`;
    const description = movie.content
      ? plain(movie.content)
      : `Xem phim ${titleName}${yearPart} Vietsub, thuyết minh chất lượng cao miễn phí tại ${SITE_NAME}.`;
    const image = movie.posterUrl || movie.thumbUrl || abs("/favicon.svg");

    const movieLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Movie",
      name: titleName,
      alternateName: movie.originName || undefined,
      description,
      image,
      url: canonical,
      inLanguage: "vi",
      genre: movie.categories.map((c) => c.name),
    };
    if (movie.year) movieLd.dateCreated = String(movie.year);
    if (movie.directors.length)
      movieLd.director = movie.directors.map((n) => ({
        "@type": "Person",
        name: n,
      }));
    if (movie.actors.length)
      movieLd.actor = movie.actors.map((n) => ({
        "@type": "Person",
        name: n,
      }));
    if (movie.score.imdb)
      movieLd.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: movie.score.imdb,
        bestRating: 10,
        ratingCount: 1000,
      };

    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Trang chủ", item: SITE },
        {
          "@type": "ListItem",
          position: 2,
          name: titleName,
          item: canonical,
        },
      ],
    };

    return {
      title,
      description,
      canonical,
      image,
      ogType: "video.movie",
      jsonLd: [movieLd, breadcrumb],
    };
  } catch {
    // Upstream failure (bad slug / KKPhim down) — fall back to a generic head so
    // the page still serves rather than 500ing the crawler.
    return {
      ...baseMeta(),
      canonical: abs(`/xem/${slug}`),
    };
  }
}
