# XoPhim P0 + P1 (Foundation + Catalog) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CATALOG layer — a Fastify proxy over the KKPhim API with in-memory TTL caching, response normalization, and a typed web data-layer (API client + TanStack Query hooks + route skeletons) — so generated UI can render Home / Browse / Search / Watch without touching KKPhim directly.

**Architecture:** All catalog endpoints live under `/v1/catalog/*`. A single `kkphimClient` fetches + validates + caches KKPhim responses; a `mapper` normalizes them into one XoPhim shape (absolute image URLs, unified pagination). Browse-style endpoints (list/category/country/year/search) share one generic KKPhim v1-list fetcher. The web app calls only `/v1/*`.

**Tech Stack:** Fastify 5, `fastify-type-provider-zod`, Zod 3, Node 20 global `fetch`, Vitest (unit + `app.inject` integration), React 18 + TanStack Query/Router, axios.

> **NO GIT COMMITS.** Per project convention the user handles git. Every task ends with a **Checkpoint** (typecheck + tests) instead of a commit. Do not run `git add`/`git commit`.

**Reference:** KKPhim contract in [docs/kkphim.openapi.json](../../kkphim.openapi.json). System spec in [docs/superpowers/specs/2026-08-06-xophim-design.md](../specs/2026-08-06-xophim-design.md).

---

## File Structure

**API (`apps/api/src/`)**
- `config/env.ts` — *modify*: add `KKPHIM_BASE_URL`.
- `catalog/types.ts` — *create*: XoPhim domain types (`XoMovie`, `XoMovieDetail`, …).
- `catalog/kkphim.schemas.ts` — *create*: Zod schemas validating KKPhim responses (fields the mapper reads; `.passthrough()` for the rest).
- `catalog/mapper.ts` — *create*: KKPhim → XoPhim normalization (absolute images, unify wrappers).
- `catalog/cache.ts` — *create*: hand-rolled TTL cache with stale-if-error support.
- `catalog/kkphimClient.ts` — *create*: fetch + timeout + retry + validate + cache.
- `catalog/service.ts` — *create*: business functions (home, list, detail, search, taxonomy, similar).
- `catalog/routes.ts` — *create*: Fastify plugin, `/catalog/*` routes with Zod I/O.
- `routes.ts` — *modify*: register the catalog plugin under `/v1`.

**API tests (`apps/api/test/`)**
- `cache.test.ts`, `mapper.test.ts`, `kkphimClient.test.ts` — unit.
- `catalog.routes.test.ts` — integration via `app.inject`.
- `fixtures/` — captured real KKPhim JSON responses.

**Web (`apps/web/src/`)**
- `lib/catalog-types.ts` — *create*: mirror of the API's XoPhim response types.
- `lib/catalog-api.ts` — *create*: typed functions calling `/v1/catalog/*`.
- `hooks/catalog.ts` — *create*: TanStack Query hooks + query keys.
- `pages/` — *create*: minimal Router skeleton (Home/Browse/Search/Watch placeholders wired to hooks).
- `main.tsx` — *modify*: mount `RouterProvider`.

---

## Task 0: Add Vitest

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/vitest.config.ts`

- [ ] **Step 1: Add the test toolchain + script**

In `apps/api/package.json`, add to `scripts`:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```
Add to `devDependencies`:
```json
    "vitest": "^2.1.8"
```

- [ ] **Step 2: Create the Vitest config**

Create `apps/api/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
  },
});
```

- [ ] **Step 3: Install**

Run: `pnpm install`
Expected: adds `vitest` to the api package, no errors.

- [ ] **Step 4: Sanity test**

Create `apps/api/test/smoke.test.ts`:
```ts
import { expect, test } from "vitest";

test("vitest runs", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @xophim/api test`
Expected: 1 passed. Then delete `apps/api/test/smoke.test.ts`.

---

## Task 1: Extend env with KKPhim base URLs

**Files:**
- Modify: `apps/api/src/config/env.ts`

Making the base URLs configurable lets tests point the client at a stub and keeps the CDN prefix in one place.

- [ ] **Step 1: Add the two vars to the Zod schema**

In `apps/api/src/config/env.ts`, inside `envSchema = z.object({ … })`, add after `DATABASE_URL`:
```ts
  // KKPhim content API (proxied by the CATALOG layer).
  KKPHIM_BASE_URL: z.string().url().default("https://phimapi.com"),
  // CDN host used to absolutize relative poster/thumb paths from /v1/api/* responses.
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors. (Defaults mean `.env` needs no change.)

---

## Task 2: TTL cache with stale-if-error

**Files:**
- Create: `apps/api/src/catalog/cache.ts`
- Test: `apps/api/test/cache.test.ts`

The cache stores a value with a fresh-until timestamp but keeps the value after expiry so the client can serve stale data when KKPhim fails. A clock function is injected for deterministic tests.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/cache.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { TtlCache } from "../src/catalog/cache.js";

describe("TtlCache", () => {
  it("returns a fresh value before TTL expires", () => {
    let now = 1000;
    const c = new TtlCache<string>({ now: () => now });
    c.set("k", "v", 500);
    now = 1400;
    expect(c.getFresh("k")).toBe("v");
  });

  it("treats a value as not-fresh after TTL", () => {
    let now = 1000;
    const c = new TtlCache<string>({ now: () => now });
    c.set("k", "v", 500);
    now = 1600;
    expect(c.getFresh("k")).toBeUndefined();
  });

  it("still exposes the stale value after expiry via getStale", () => {
    let now = 1000;
    const c = new TtlCache<string>({ now: () => now });
    c.set("k", "v", 500);
    now = 5000;
    expect(c.getFresh("k")).toBeUndefined();
    expect(c.getStale("k")).toBe("v");
  });

  it("evicts the oldest entry past maxEntries", () => {
    const c = new TtlCache<string>({ now: () => 0, maxEntries: 2 });
    c.set("a", "1", 100);
    c.set("b", "2", 100);
    c.set("c", "3", 100);
    expect(c.getStale("a")).toBeUndefined();
    expect(c.getStale("b")).toBe("2");
    expect(c.getStale("c")).toBe("3");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xophim/api test cache`
Expected: FAIL — cannot find module `../src/catalog/cache.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/catalog/cache.ts`:
```ts
interface Entry<T> {
  value: T;
  freshUntil: number;
}

interface Options {
  now?: () => number;
  maxEntries?: number;
}

// TTL cache that retains expired values so callers can fall back to stale data
// when the upstream fails (stale-if-error). Insertion-ordered eviction (LRU-ish
// for a proxy where every key is read soon after write).
export class TtlCache<T> {
  private readonly store = new Map<string, Entry<T>>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(opts: Options = {}) {
    this.now = opts.now ?? Date.now;
    this.maxEntries = opts.maxEntries ?? 500;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.store.delete(key);
    this.store.set(key, { value, freshUntil: this.now() + ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  getFresh(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    return this.now() <= entry.freshUntil ? entry.value : undefined;
  }

  getStale(key: string): T | undefined {
    return this.store.get(key)?.value;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xophim/api test cache`
Expected: 4 passed.

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 3: XoPhim domain types + KKPhim Zod schemas

**Files:**
- Create: `apps/api/src/catalog/types.ts`
- Create: `apps/api/src/catalog/kkphim.schemas.ts`

No tests here — these are consumed by the mapper (Task 4) whose tests cover them.

- [ ] **Step 1: Create the XoPhim domain types**

Create `apps/api/src/catalog/types.ts`:
```ts
// The single normalized shape returned to the web app. KKPhim quirks
// (relative image paths, dual response wrappers) never leak past the mapper.
export interface XoTaxonomy {
  name: string;
  slug: string;
}

export interface XoScore {
  imdb: number | null;
  tmdb: number | null;
}

export interface XoMovie {
  slug: string;
  name: string;
  originName: string;
  posterUrl: string;
  thumbUrl: string;
  type: string;
  year: number | null;
  quality: string;
  lang: string;
  episodeCurrent: string;
  categories: XoTaxonomy[];
  countries: XoTaxonomy[];
  score: XoScore;
}

export interface XoServerData {
  name: string;
  slug: string;
  linkEmbed: string;
  linkM3u8: string;
}

export interface XoEpisodeServer {
  serverName: string;
  items: XoServerData[];
}

export interface XoMovieDetail extends XoMovie {
  content: string;
  status: string;
  episodeTotal: number;
  trailerUrl: string | null;
  actors: string[];
  directors: string[];
  time: string;
  episodes: XoEpisodeServer[];
}

export interface XoPagination {
  page: number;
  totalPages: number;
  totalItems: number;
}

export interface XoPaged<T> {
  items: T[];
  pagination: XoPagination;
}
```

- [ ] **Step 2: Create the KKPhim response schemas**

Create `apps/api/src/catalog/kkphim.schemas.ts`:
```ts
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

export const kkMovieItem = z
  .object({
    slug: z.string(),
    name: z.string(),
    origin_name: z.string().optional().default(""),
    poster_url: z.string().optional().default(""),
    thumb_url: z.string().optional().default(""),
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

// Wrapper A: /danh-sach/phim-moi-cap-nhat* — absolute images, top-level pagination.
export const kkLatestResponse = z
  .object({
    items: z.array(kkMovieItem),
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
```

- [ ] **Step 3: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 4: Mapper (KKPhim → XoPhim)

**Files:**
- Create: `apps/api/src/catalog/mapper.ts`
- Test: `apps/api/test/mapper.test.ts`

The mapper is the heart of the normalization: it absolutizes image URLs (relative on `/v1/api/*`, already absolute on latest/detail) and unifies both pagination wrappers.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/mapper.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xophim/api test mapper`
Expected: FAIL — cannot find module `../src/catalog/mapper.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/catalog/mapper.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xophim/api test mapper`
Expected: all passed.

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 5: kkphimClient (fetch + timeout + retry + validate + cache)

**Files:**
- Create: `apps/api/src/catalog/kkphimClient.ts`
- Test: `apps/api/test/kkphimClient.test.ts`

The client is the only place that talks to KKPhim. It caches by URL, validates with a provided Zod schema, and on upstream failure serves stale cache (stale-if-error) before giving up.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/kkphimClient.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { KkphimClient } from "../src/catalog/kkphimClient.js";

const schema = z.object({ value: z.number() });

function makeClient(fetchImpl: typeof fetch, now = () => 0) {
  return new KkphimClient({
    baseUrl: "https://kk.test",
    fetchImpl,
    now,
    logger: { warn: () => {}, error: () => {} },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("KkphimClient.get", () => {
  it("fetches, validates, and returns the parsed value", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ value: 1 }), { status: 200 }),
    );
    const c = makeClient(fetchImpl as unknown as typeof fetch);
    const out = await c.get("/x", schema, 1000);
    expect(out).toEqual({ value: 1 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("serves a fresh cached value without a second fetch", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ value: 2 }), { status: 200 }),
    );
    const c = makeClient(fetchImpl as unknown as typeof fetch);
    await c.get("/x", schema, 1000);
    const out = await c.get("/x", schema, 1000);
    expect(out).toEqual({ value: 2 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("falls back to stale cache when the upstream later fails", async () => {
    let now = 0;
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) return new Response(JSON.stringify({ value: 3 }), { status: 200 });
      throw new Error("network down");
    });
    const c = makeClient(fetchImpl as unknown as typeof fetch, () => now);
    await c.get("/x", schema, 1000); // primes cache
    now = 10_000; // expire it
    const out = await c.get("/x", schema, 1000);
    expect(out).toEqual({ value: 3 }); // stale served
  });

  it("throws UpstreamError when it fails with no cache", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));
    const c = makeClient(fetchImpl as unknown as typeof fetch);
    await expect(c.get("/x", schema, 1000)).rejects.toThrow(/upstream/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xophim/api test kkphimClient`
Expected: FAIL — cannot find module `../src/catalog/kkphimClient.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/catalog/kkphimClient.ts`:
```ts
import type { ZodType } from "zod";
import { TtlCache } from "./cache.js";

export class UpstreamError extends Error {
  statusCode = 502;
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

interface Logger {
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

interface Options {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  logger?: Logger;
  timeoutMs?: number;
}

// The single gateway to KKPhim. Caches raw parsed JSON per URL; on any upstream
// or validation failure, serves stale cache if present (stale-if-error), else 502.
export class KkphimClient {
  private readonly cache = new TtlCache<unknown>({});
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Logger;
  private readonly timeoutMs: number;

  constructor(opts: Options) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.logger = opts.logger ?? { warn: console.warn, error: console.error };
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    // `now` is accepted for cache determinism in tests.
    if (opts.now) this.cache = new TtlCache<unknown>({ now: opts.now });
  }

  async get<T>(path: string, schema: ZodType<T>, ttlMs: number): Promise<T> {
    const key = path;
    const fresh = this.cache.getFresh(key);
    if (fresh !== undefined) return fresh as T;

    try {
      const json = await this.fetchWithRetry(path);
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        this.logger.warn(`KKPhim schema drift at ${path}: ${parsed.error.message}`);
        throw new Error("schema validation failed");
      }
      this.cache.set(key, parsed.data, ttlMs);
      return parsed.data;
    } catch (err) {
      const stale = this.cache.getStale(key);
      if (stale !== undefined) {
        this.logger.warn(`KKPhim failed at ${path}, serving stale cache`);
        return stale as T;
      }
      this.logger.error(`KKPhim failed at ${path}: ${(err as Error).message}`);
      throw new UpstreamError(`Upstream KKPhim request failed: ${path}`);
    }
  }

  private async fetchWithRetry(path: string): Promise<unknown> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.fetchJson(path);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  private async fetchJson(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xophim/api test kkphimClient`
Expected: all passed.

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 6: Capture real KKPhim fixtures

**Files:**
- Create: `apps/api/test/fixtures/detail.json`, `list.json`, `latest.json`, `categories.json`, `countries.json`

Integration tests stub `fetch` with these so they never hit the network. Capture from the live API once.

- [ ] **Step 1: Fetch and save fixtures**

Run (bash):
```bash
mkdir -p apps/api/test/fixtures
curl -sk "https://phimapi.com/phim/dong-ho-cat" -o apps/api/test/fixtures/detail.json
curl -sk "https://phimapi.com/v1/api/danh-sach/phim-bo?page=1&limit=2" -o apps/api/test/fixtures/list.json
curl -sk "https://phimapi.com/danh-sach/phim-moi-cap-nhat-v3?page=1" -o apps/api/test/fixtures/latest.json
curl -sk "https://phimapi.com/the-loai" -o apps/api/test/fixtures/categories.json
curl -sk "https://phimapi.com/quoc-gia" -o apps/api/test/fixtures/countries.json
```
Expected: five non-empty JSON files. If the network blocks `phimapi.com`, hand-author minimal fixtures matching the shapes in [docs/kkphim.openapi.json](../../kkphim.openapi.json).

- [ ] **Step 2: Verify they parse**

Run: `node -e "for(const f of ['detail','list','latest','categories','countries']) JSON.parse(require('fs').readFileSync('apps/api/test/fixtures/'+f+'.json'))" && echo ok`
Expected: `ok`.

---

## Task 7: Catalog service

**Files:**
- Create: `apps/api/src/catalog/service.ts`
- Test: covered by route integration tests in Task 9.

The service wires the client + mapper into business functions. Browse-style calls share one private `v1List` helper (DRY). Base-URL/CDN come from `env`.

- [ ] **Step 1: Write the implementation**

Create `apps/api/src/catalog/service.ts`:
```ts
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
  category?: string;
  country?: string;
  year?: number;
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
      items: resp.items.map((it) => mapMovieItem(it, cdn)),
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
  }> {
    const [latest, phimBo, phimLe, hoatHinh] = await Promise.all([
      this.latest(1),
      this.list("phim-bo", { limit: 12 }),
      this.list("phim-le", { limit: 12 }),
      this.list("hoat-hinh", { limit: 12 }),
    ]);
    return {
      latest: latest.items,
      phimBo: phimBo.items,
      phimLe: phimLe.items,
      hoatHinh: hoatHinh.items,
    };
  }
}

// Singleton wired to configured env, decorated onto the app in routes.ts.
export const catalogService = new CatalogService(
  new KkphimClient({ baseUrl: env.KKPHIM_BASE_URL }),
);
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 8: Catalog routes plugin

**Files:**
- Create: `apps/api/src/catalog/routes.ts`
- Modify: `apps/api/src/routes.ts`

Thin Fastify handlers with Zod query/response schemas. They call the service and return the already-normalized shape.

- [ ] **Step 1: Create the routes plugin**

Create `apps/api/src/catalog/routes.ts`:
```ts
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { catalogService, type ListQuery } from "./service.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(64).optional(),
  sort_field: z.enum(["modified.time", "_id", "year"]).optional(),
  sort_type: z.enum(["asc", "desc"]).optional(),
  category: z.string().optional(),
  country: z.string().optional(),
  year: z.coerce.number().int().optional(),
});

function toListQuery(q: z.infer<typeof listQuerySchema>): ListQuery {
  return q;
}

export const registerCatalogRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/home", async () => catalogService.home());

  app.get(
    "/list/:type",
    { schema: { params: z.object({ type: z.string() }), querystring: listQuerySchema } },
    async (req) => catalogService.list(req.params.type, toListQuery(req.query)),
  );

  app.get(
    "/category/:slug",
    { schema: { params: z.object({ slug: z.string() }), querystring: listQuerySchema } },
    async (req) => catalogService.category(req.params.slug, toListQuery(req.query)),
  );

  app.get(
    "/country/:slug",
    { schema: { params: z.object({ slug: z.string() }), querystring: listQuerySchema } },
    async (req) => catalogService.country(req.params.slug, toListQuery(req.query)),
  );

  app.get(
    "/year/:year",
    { schema: { params: z.object({ year: z.coerce.number().int() }), querystring: listQuerySchema } },
    async (req) => catalogService.year(req.params.year, toListQuery(req.query)),
  );

  app.get(
    "/search",
    { schema: { querystring: listQuerySchema.extend({ keyword: z.string().min(1) }) } },
    async (req) => {
      const { keyword, ...rest } = req.query;
      return catalogService.search(keyword, toListQuery(rest));
    },
  );

  app.get(
    "/detail/:slug",
    { schema: { params: z.object({ slug: z.string() }) } },
    async (req) => catalogService.detail(req.params.slug),
  );

  app.get("/categories", async () => catalogService.categories());
  app.get("/countries", async () => catalogService.countries());

  app.get("/filters", async () => {
    const [categories, countries] = await Promise.all([
      catalogService.categories(),
      catalogService.countries(),
    ]);
    const currentYear = 2026;
    const years = Array.from({ length: currentYear - 1970 + 1 }, (_, i) => currentYear - i);
    return { categories, countries, years };
  });
};
```

- [ ] **Step 2: Register it under /v1**

In `apps/api/src/routes.ts`, add the import and registration. The file's `registerRoutes` currently only defines `/health`. Add at the top of the function body, before the `/health` handler:
```ts
import { registerCatalogRoutes } from "./catalog/routes.js";
```
and inside `registerRoutes`:
```ts
  await app.register(registerCatalogRoutes, { prefix: "/catalog" });
```

- [ ] **Step 3: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 9: Catalog route integration tests

**Files:**
- Create: `apps/api/test/catalog.routes.test.ts`

Stub `fetch` with fixtures so tests are hermetic. Route the stub by URL substring.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/catalog.routes.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `pnpm --filter @xophim/api test catalog.routes`
Expected: initially FAIL if any wiring is off; fix until all pass. Target: 5 passed.

- [ ] **Step 3: Checkpoint — full api suite + typecheck**

Run: `pnpm --filter @xophim/api test && pnpm --filter @xophim/api typecheck`
Expected: all tests pass, no type errors.

---

## Task 10: Web catalog types

**Files:**
- Create: `apps/web/src/lib/catalog-types.ts`

Mirror the API's XoPhim shapes so hooks are typed. (Kept in web to avoid a shared package; the API is the source of truth.)

- [ ] **Step 1: Create the types**

Create `apps/web/src/lib/catalog-types.ts`:
```ts
export interface Taxonomy {
  name: string;
  slug: string;
}
export interface Score {
  imdb: number | null;
  tmdb: number | null;
}
export interface Movie {
  slug: string;
  name: string;
  originName: string;
  posterUrl: string;
  thumbUrl: string;
  type: string;
  year: number | null;
  quality: string;
  lang: string;
  episodeCurrent: string;
  categories: Taxonomy[];
  countries: Taxonomy[];
  score: Score;
}
export interface ServerItem {
  name: string;
  slug: string;
  linkEmbed: string;
  linkM3u8: string;
}
export interface EpisodeServer {
  serverName: string;
  items: ServerItem[];
}
export interface MovieDetail extends Movie {
  content: string;
  status: string;
  episodeTotal: number;
  trailerUrl: string | null;
  actors: string[];
  directors: string[];
  time: string;
  episodes: EpisodeServer[];
}
export interface Pagination {
  page: number;
  totalPages: number;
  totalItems: number;
}
export interface Paged<T> {
  items: T[];
  pagination: Pagination;
}
export interface HomeData {
  latest: Movie[];
  phimBo: Movie[];
  phimLe: Movie[];
  hoatHinh: Movie[];
}
export interface DetailData {
  movie: MovieDetail;
  similar: Movie[];
}
export interface FiltersData {
  categories: Taxonomy[];
  countries: Taxonomy[];
  years: number[];
}
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

---

## Task 11: Web catalog API client

**Files:**
- Create: `apps/web/src/lib/catalog-api.ts`

- [ ] **Step 1: Create the client functions**

Create `apps/web/src/lib/catalog-api.ts`:
```ts
import { api } from "./api";
import type {
  DetailData,
  FiltersData,
  HomeData,
  Movie,
  Paged,
  Taxonomy,
} from "./catalog-types";

export interface ListParams {
  page?: number;
  limit?: number;
  sort_field?: "modified.time" | "_id" | "year";
  sort_type?: "asc" | "desc";
  category?: string;
  country?: string;
  year?: number;
}

const get = async <T>(url: string, params?: Record<string, unknown>): Promise<T> => {
  const res = await api.get<T>(url, { params });
  return res.data;
};

export const catalogApi = {
  home: () => get<HomeData>("/catalog/home"),
  detail: (slug: string) => get<DetailData>(`/catalog/detail/${slug}`),
  list: (type: string, params: ListParams) => get<Paged<Movie>>(`/catalog/list/${type}`, params),
  category: (slug: string, params: ListParams) =>
    get<Paged<Movie>>(`/catalog/category/${slug}`, params),
  country: (slug: string, params: ListParams) =>
    get<Paged<Movie>>(`/catalog/country/${slug}`, params),
  year: (year: number, params: ListParams) => get<Paged<Movie>>(`/catalog/year/${year}`, params),
  search: (keyword: string, params: ListParams) =>
    get<Paged<Movie>>("/catalog/search", { keyword, ...params }),
  categories: () => get<Taxonomy[]>("/catalog/categories"),
  countries: () => get<Taxonomy[]>("/catalog/countries"),
  filters: () => get<FiltersData>("/catalog/filters"),
};
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

---

## Task 12: Web TanStack Query hooks

**Files:**
- Create: `apps/web/src/hooks/catalog.ts`

- [ ] **Step 1: Create the hooks + query keys**

Create `apps/web/src/hooks/catalog.ts`:
```ts
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
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

---

## Task 13: Web Router skeleton wired to hooks

**Files:**
- Create: `apps/web/src/routes/root.tsx`, `home.tsx`, `browse.tsx`, `search.tsx`, `watch.tsx`, `router.tsx`
- Modify: `apps/web/src/main.tsx`

Minimal placeholder pages that call the hooks and dump JSON. Generated UI replaces the render bodies later; the data wiring and routes are already correct.

- [ ] **Step 1: Create the route components**

Create `apps/web/src/routes/root.tsx`:
```tsx
import { Outlet } from "@tanstack/react-router";

export function RootLayout() {
  return (
    <div className="min-h-screen bg-neutral-900 text-white">
      <Outlet />
    </div>
  );
}
```

Create `apps/web/src/routes/home.tsx`:
```tsx
import { useHome } from "../hooks/catalog";

export function HomePage() {
  const { data, isLoading, error } = useHome();
  if (isLoading) return <p className="p-6">Đang tải...</p>;
  if (error) return <p className="p-6">Đã có lỗi xảy ra</p>;
  return <pre className="p-6 text-xs">{JSON.stringify(data, null, 2)}</pre>;
}
```

Create `apps/web/src/routes/browse.tsx`:
```tsx
import { useParams } from "@tanstack/react-router";
import { useMovieList } from "../hooks/catalog";

export function BrowsePage() {
  const { type } = useParams({ from: "/list/$type" });
  const { data, isLoading } = useMovieList(type, { page: 1 });
  if (isLoading) return <p className="p-6">Đang tải...</p>;
  return <pre className="p-6 text-xs">{JSON.stringify(data, null, 2)}</pre>;
}
```

Create `apps/web/src/routes/search.tsx`:
```tsx
import { useSearch as useSearchParams } from "@tanstack/react-router";
import { useSearch } from "../hooks/catalog";

export function SearchPage() {
  const { keyword = "" } = useSearchParams({ from: "/search" }) as { keyword?: string };
  const { data, isLoading } = useSearch(keyword, { page: 1 });
  if (!keyword) return <p className="p-6">Nhập từ khóa để tìm kiếm</p>;
  if (isLoading) return <p className="p-6">Đang tải...</p>;
  return <pre className="p-6 text-xs">{JSON.stringify(data, null, 2)}</pre>;
}
```

Create `apps/web/src/routes/watch.tsx`:
```tsx
import { useParams } from "@tanstack/react-router";
import { useMovieDetail } from "../hooks/catalog";

export function WatchPage() {
  const { slug } = useParams({ from: "/xem/$slug" });
  const { data, isLoading, error } = useMovieDetail(slug);
  if (isLoading) return <p className="p-6">Đang tải...</p>;
  if (error) return <p className="p-6">Đã có lỗi xảy ra</p>;
  return <pre className="p-6 text-xs">{JSON.stringify(data, null, 2)}</pre>;
}
```

- [ ] **Step 2: Create the router**

Create `apps/web/src/routes/router.tsx`:
```tsx
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootLayout } from "./root";
import { HomePage } from "./home";
import { BrowsePage } from "./browse";
import { SearchPage } from "./search";
import { WatchPage } from "./watch";

const rootRoute = createRootRoute({ component: RootLayout });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });
const browseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/list/$type",
  component: BrowsePage,
});
const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  validateSearch: (s: Record<string, unknown>) => ({ keyword: (s.keyword as string) ?? "" }),
  component: SearchPage,
});
const watchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/xem/$slug",
  component: WatchPage,
});

const routeTree = rootRoute.addChildren([homeRoute, browseRoute, searchRoute, watchRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 3: Mount the router in main.tsx**

Replace the `<App />` usage in `apps/web/src/main.tsx`. Change the imports and render tree:
```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";

import { router } from "./routes/router";
import "./index.css";

const queryClient = new QueryClient();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster theme="dark" position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
);
```
Leave `apps/web/src/App.tsx` in place (unused now; a later UI task or cleanup can remove it).

- [ ] **Step 4: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors. (If `useParams`/`useSearch` generics complain, confirm `@tanstack/react-router` version ≥ 1.81 as in package.json and adjust the `from` ids to match the created paths.)

---

## Task 14: End-to-end smoke against a running dev server (manual, optional)

**Files:** none.

- [ ] **Step 1: Start the API and hit a route**

Run: `pnpm --filter @xophim/api dev` (needs a reachable `DATABASE_URL` for boot; catalog itself needs none). In another shell:
```bash
curl -s localhost:5243/v1/catalog/detail/dong-ho-cat | head -c 300
```
Expected: JSON with `"movie"` and an absolute `posterUrl`. If KKPhim is unreachable from the host, this returns 502 — expected offline; the integration tests (Task 9) are the authoritative check.

- [ ] **Step 2: Final checkpoint**

Run: `pnpm --filter @xophim/api test && pnpm --filter @xophim/api typecheck && pnpm --filter @xophim/web typecheck`
Expected: all green.

---

## Self-Review Notes (spec coverage)

- **Content proxy + cache + mapper + stale-if-error** → Tasks 2, 4, 5. ✅
- **In-memory TTL, no Redis** → Task 2. ✅
- **All `/v1/catalog/*` routes** (home, list, category, country, year, search, detail, categories, countries, filters) → Task 8. ✅
- **IMDb/TMDb score surfaced** → mapper `score()` + `XoMovie.score`, Task 4. ✅
- **Similar movies in detail** → service `detail()`, Task 7. ✅
- **Image normalization + dual-wrapper unify** → mapper, Task 4. ✅
- **Upstream failure → 502** → `UpstreamError.statusCode=502` handled by existing central error handler, Task 5. ✅
- **Web data-layer (client + hooks + route skeletons), no visual components** → Tasks 10–13. ✅
- **Vitest + TDD** → every logic task is test-first. ✅
- **Deferred (P2+):** auth, user-state, community, collections, watch party — not in this plan. ✅

Not yet wired: TTL constants live in the service (Task 7) rather than env — acceptable, documented. `filters` uses a hardcoded `currentYear = 2026`; revisit if the site runs past 2026.
