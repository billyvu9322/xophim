import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(join(here, "fixtures", `${name}.json`), "utf8");

function stubFetch() {
  return vi.fn(async (url: string | URL) => {
    const u = String(url);
    const body = u.includes("/phim/")
      ? fixture("detail")
      : u.includes("phim-moi-cap-nhat")
        ? fixture("latest")
        : u.includes("/the-loai") && !u.includes("/v1/api/")
          ? fixture("categories")
          : u.includes("/quoc-gia") && !u.includes("/v1/api/")
            ? fixture("countries")
            : fixture("list"); // all /v1/api/* list-style calls
    return new Response(body, { status: 200 });
  });
}

let app: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>;

beforeAll(async () => {
  vi.stubGlobal("fetch", stubFetch());
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe("GET /v1/catalog", () => {
  it("detail returns a normalized movie with absolute poster + episodes + similar", async () => {
    const res = await app.inject({ url: "/v1/catalog/detail/dong-ho-cat" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.movie.slug).toBe("dong-ho-cat");
    expect(body.movie.posterUrl).toMatch(/^https?:\/\//);
    expect(Array.isArray(body.movie.episodes)).toBe(true);
    expect(Array.isArray(body.similar)).toBe(true);
  });

  it("list returns items + unified pagination", async () => {
    const res = await app.inject({ url: "/v1/catalog/list/phim-bo?page=1" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.pagination).toHaveProperty("page");
    expect(body.pagination).toHaveProperty("totalPages");
  });

  it("search requires a keyword", async () => {
    const res = await app.inject({ url: "/v1/catalog/search" });
    expect(res.statusCode).toBe(400);
  });

  it("categories returns a flat taxonomy list", async () => {
    const res = await app.inject({ url: "/v1/catalog/categories" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body[0]).toHaveProperty("slug");
    expect(body[0]).toHaveProperty("name");
  });

  it("home aggregates several rails", async () => {
    const res = await app.inject({ url: "/v1/catalog/home" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("latest");
    expect(body).toHaveProperty("phimBo");
  });
});
