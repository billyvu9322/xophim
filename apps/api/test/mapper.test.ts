import { describe, expect, it } from "vitest";
import {
  absoluteImage,
  mapDetail,
  mapMovieItem,
  mapV1List,
} from "../src/catalog/mapper.js";

const CDN = "https://phimimg.com";

describe("absoluteImage", () => {
  it("passes through an already-absolute URL", () => {
    expect(absoluteImage("https://x/y.webp", CDN)).toBe("https://x/y.webp");
  });
  it("prefixes the CDN onto a relative path", () => {
    expect(absoluteImage("uploads/a.webp", CDN)).toBe(`${CDN}/uploads/a.webp`);
  });
  it("handles a leading slash without doubling", () => {
    expect(absoluteImage("/uploads/a.webp", CDN)).toBe(`${CDN}/uploads/a.webp`);
  });
  it("returns empty string for empty input", () => {
    expect(absoluteImage("", CDN)).toBe("");
  });
});

describe("mapMovieItem", () => {
  it("maps snake_case KKPhim fields to the XoPhim shape and reads scores", () => {
    const xo = mapMovieItem(
      {
        slug: "dong-ho-cat",
        name: "Đồng Hồ Cát",
        origin_name: "Reversed Destiny",
        poster_url: "uploads/p.webp",
        thumb_url: "uploads/t.webp",
        type: "single",
        year: 2024,
        quality: "FHD",
        lang: "Vietsub",
        episode_current: "Full",
        category: [{ name: "Tình Cảm", slug: "tinh-cam" }],
        country: [{ name: "Trung Quốc", slug: "trung-quoc" }],
        imdb: { vote_average: 7.5 },
        tmdb: { vote_average: 8.1 },
      },
      CDN,
    );
    expect(xo.slug).toBe("dong-ho-cat");
    expect(xo.posterUrl).toBe(`${CDN}/uploads/p.webp`);
    expect(xo.categories).toEqual([{ name: "Tình Cảm", slug: "tinh-cam" }]);
    expect(xo.score).toEqual({ imdb: 7.5, tmdb: 8.1 });
  });

  it("nulls out zero/absent scores", () => {
    const xo = mapMovieItem(
      { slug: "s", name: "n", imdb: { vote_average: 0 } },
      CDN,
    );
    expect(xo.score).toEqual({ imdb: null, tmdb: null });
  });
});

describe("mapV1List", () => {
  it("unifies items + pagination from the /v1/api wrapper using its CDN domain", () => {
    const paged = mapV1List({
      data: {
        items: [{ slug: "a", name: "A", poster_url: "uploads/a.webp" }],
        params: { pagination: { totalItems: 100, currentPage: 2, totalPages: 5 } },
        APP_DOMAIN_CDN_IMAGE: CDN,
      },
    });
    expect(paged.items[0]?.posterUrl).toBe(`${CDN}/uploads/a.webp`);
    expect(paged.pagination).toEqual({ page: 2, totalPages: 5, totalItems: 100 });
  });
});

describe("mapDetail", () => {
  it("maps the movie plus grouped episode servers with stream links", () => {
    const d = mapDetail({
      movie: {
        slug: "dong-ho-cat",
        name: "Đồng Hồ Cát",
        poster_url: "https://phimimg.com/p.webp",
        content: "<p>hi</p>",
        status: "completed",
        episode_total: 1,
        actor: ["A"],
        director: ["B"],
      },
      episodes: [
        {
          server_name: "Vietsub",
          server_data: [
            { name: "Full", slug: "full", link_embed: "e", link_m3u8: "m" },
          ],
        },
      ],
    });
    expect(d.posterUrl).toBe("https://phimimg.com/p.webp");
    expect(d.content).toBe("<p>hi</p>");
    expect(d.episodeTotal).toBe(1);
    expect(d.actors).toEqual(["A"]);
    expect(d.episodes[0]?.serverName).toBe("Vietsub");
    expect(d.episodes[0]?.items[0]?.linkM3u8).toBe("m");
  });
});
