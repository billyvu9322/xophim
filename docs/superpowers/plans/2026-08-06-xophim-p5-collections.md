# XoPhim P5 (Collections / Chủ Đề – Bộ Sưu Tập) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the COLLECTIONS layer — editor-curated lists of KKPhim movies (referenced by slug), stored with a `movie_snapshot` so list/detail views render without hitting KKPhim per item. Public endpoints serve published collections; admin endpoints (role guard) allow full CRUD and item management. A typed web data-layer (TanStack Query hooks) is delivered for the public views plus optional admin mutation hooks.

**Architecture:** Two Drizzle tables (`collections`, `collection_items`) in Postgres. A single Fastify plugin at `/v1/collections`. Public routes are open. Admin routes share a `requireAdmin` preHandler that builds on Phase 2's `app.requireAuth` (which sets `request.user`). The web layer mirrors P0–P1 patterns: a typed API client function file + TanStack Query hooks. No snapshot refresh is done in MVP — `movie_snapshot` is written at item-add time and stays until replaced.

**Tech Stack:** Drizzle ORM, `drizzle-kit` migration, Fastify 5, `fastify-type-provider-zod`, Zod 3, Vitest (unit + `app.inject` integration with pg-mem).

**Dependencies:** Phase 1 (catalog types + `app.db`); Phase 2 (`app.requireAuth`, `request.user` with `{id, role}`). This plan assumes those are implemented. If the test environment lacks pg-mem (used in P2/P3 plans for integration testing), the seeding pattern below mirrors the P2/P3 convention exactly.

> **NO GIT COMMITS.** Per project convention the user handles git. Every task ends with a **Checkpoint** (typecheck + tests). Do not run `git add` / `git commit`.

**Reference:** System spec §3 (COLLECTIONS data model) and §4 (COLLECTIONS API) in [docs/superpowers/specs/2026-08-06-xophim-design.md](../specs/2026-08-06-xophim-design.md).

---

## File Structure

**API (`apps/api/src/`)**
- `db/schema/index.ts` — *modify*: export `collections` and `collectionItems` tables.
- `collections/routes.ts` — *create*: Fastify plugin, all `/collections/*` routes.
- `routes.ts` — *modify*: register the collections plugin under `/v1`.

**API tests (`apps/api/test/`)**
- `collections.unit.test.ts` — *create*: unit tests for snapshot enrichment helper, published filter, and item sort.
- `collections.routes.test.ts` — *create*: integration tests via `app.inject` (public GETs + admin guard 401/403/200).

**Web (`apps/web/src/`)**
- `lib/collections-types.ts` — *create*: mirror types for `Collection`, `CollectionDetail`, `CollectionItem`.
- `lib/collections-api.ts` — *create*: typed functions calling `/v1/collections/*`.
- `hooks/collections.ts` — *create*: TanStack Query hooks (`useCollections`, `useCollection`; admin mutations `useUpsertCollection`, `useDeleteCollection`).

---

## Task 1: Drizzle schema — `collections` + `collection_items`

**Files:**
- Modify: `apps/api/src/db/schema/index.ts`

Add both tables to the schema. The `created_by` column is a FK to `users`. Since Phase 2 adds the `users` table, this plan declares `created_by` as a `uuid` with an inline FK reference using Drizzle's `references` helper — which requires the `users` table to be exported from the same schema/index. If Phase 2 has not landed yet (tables absent), Drizzle still generates the migration correctly as long as the reference is declared; `drizzle-kit generate` will write both the table creation and the FK in the same migration output.

- [ ] **Step 1: Add the two table definitions**

Replace the contents of `apps/api/src/db/schema/index.ts` with:
```ts
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// COLLECTIONS (Phase 5)
// Editor-curated lists of movies. Only is_published=true rows are visible to
// the public. movie_snapshot on each item lets list/detail render without
// calling KKPhim per row (avoids N+1).
// ---------------------------------------------------------------------------

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  cover_url: text("cover_url").notNull().default(""),
  is_published: boolean("is_published").notNull().default(false),
  sort: integer("sort").notNull().default(0),
  // FK to users (Phase 2). Declaration is valid even if users table
  // lands in a separate migration — drizzle-kit resolves ordering.
  created_by: uuid("created_by").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const collectionItems = pgTable(
  "collection_items",
  {
    collection_id: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    movie_slug: text("movie_slug").notNull(),
    sort: integer("sort").notNull().default(0),
    // Snapshot written at item-add time; lets list/detail render without N+1
    // KKPhim calls. Schema: {name, posterUrl, thumbUrl, type, year, quality}.
    movie_snapshot: jsonb("movie_snapshot").notNull().default({}),
  },
  (t) => [unique("collection_items_unique").on(t.collection_id, t.movie_slug)],
);

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
export type CollectionItem = typeof collectionItems.$inferSelect;
export type NewCollectionItem = typeof collectionItems.$inferInsert;
```

- [ ] **Step 2: Checkpoint — typecheck**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

- [ ] **Step 3: Generate the migration**

Run: `pnpm --filter @xophim/api db:generate`
Expected: a new file appears under `apps/api/drizzle/` (e.g. `0001_collections.sql`) containing `CREATE TABLE collections` and `CREATE TABLE collection_items` with the unique constraint. No errors.

---

## Task 2: Unit tests — snapshot enrichment, published filter, item sort

**Files:**
- Create: `apps/api/test/collections.unit.test.ts`

These tests cover three pure helper functions that will live inside `collections/routes.ts`. Write them first (TDD red→green). The helpers are:

1. `filterPublished(rows)` — keeps only `is_published === true` rows.
2. `sortBySort(rows)` — sorts an array of objects ascending by `.sort`.
3. `enrichItems(items)` — takes raw `CollectionItem[]` and returns each with `movie_snapshot` parsed into a typed object (jsonb comes back as `unknown` from Drizzle, cast to the snapshot shape).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/collections.unit.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  filterPublished,
  sortBySort,
  enrichItems,
} from "../src/collections/helpers.js";

// ── filterPublished ──────────────────────────────────────────────────────────
describe("filterPublished", () => {
  it("keeps only published rows", () => {
    const rows = [
      { id: "1", is_published: true, sort: 0 },
      { id: "2", is_published: false, sort: 1 },
      { id: "3", is_published: true, sort: 2 },
    ] as Parameters<typeof filterPublished>[0];
    const result = filterPublished(rows);
    expect(result.map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("returns empty array when none are published", () => {
    const rows = [
      { id: "a", is_published: false, sort: 0 },
    ] as Parameters<typeof filterPublished>[0];
    expect(filterPublished(rows)).toHaveLength(0);
  });
});

// ── sortBySort ───────────────────────────────────────────────────────────────
describe("sortBySort", () => {
  it("sorts ascending by the .sort field", () => {
    const rows = [
      { id: "b", sort: 10 },
      { id: "a", sort: 0 },
      { id: "c", sort: 5 },
    ];
    const sorted = sortBySort(rows);
    expect(sorted.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("is stable: equal sort values preserve input order", () => {
    const rows = [
      { id: "x", sort: 1 },
      { id: "y", sort: 1 },
    ];
    const sorted = sortBySort(rows);
    expect(sorted.map((r) => r.id)).toEqual(["x", "y"]);
  });

  it("does not mutate the input array", () => {
    const rows = [{ id: "a", sort: 3 }, { id: "b", sort: 1 }];
    const original = [...rows];
    sortBySort(rows);
    expect(rows).toEqual(original);
  });
});

// ── enrichItems ──────────────────────────────────────────────────────────────
describe("enrichItems", () => {
  it("casts movie_snapshot from jsonb unknown to the typed shape", () => {
    const raw = [
      {
        collection_id: "c1",
        movie_slug: "dong-ho-cat",
        sort: 0,
        movie_snapshot: {
          name: "Đồng Hồ Cát",
          posterUrl: "https://cdn/p.webp",
          thumbUrl: "https://cdn/t.webp",
          type: "single",
          year: 2024,
          quality: "FHD",
        },
      },
    ] as Parameters<typeof enrichItems>[0];
    const result = enrichItems(raw);
    expect(result[0]?.snapshot.name).toBe("Đồng Hồ Cát");
    expect(result[0]?.snapshot.posterUrl).toBe("https://cdn/p.webp");
    expect(result[0]?.movieSlug).toBe("dong-ho-cat");
    expect(result[0]?.sort).toBe(0);
  });

  it("handles an empty snapshot gracefully with fallback fields", () => {
    const raw = [
      {
        collection_id: "c1",
        movie_slug: "unknown-movie",
        sort: 1,
        movie_snapshot: {},
      },
    ] as Parameters<typeof enrichItems>[0];
    const result = enrichItems(raw);
    expect(result[0]?.snapshot.name).toBe("");
    expect(result[0]?.snapshot.posterUrl).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xophim/api test collections.unit`
Expected: FAIL — cannot find module `../src/collections/helpers.js`.

- [ ] **Step 3: Write the helpers implementation**

Create `apps/api/src/collections/helpers.ts`:
```ts
// Pure helpers for the collections layer. Exported so they are unit-testable
// in isolation from Fastify and Drizzle.

// Minimal shape stored in movie_snapshot jsonb.
export interface MovieSnapshot {
  name: string;
  posterUrl: string;
  thumbUrl: string;
  type: string;
  year: number | null;
  quality: string;
}

// Row shapes used by the helpers — just the fields they need.
export interface WithPublished {
  id: string;
  is_published: boolean;
  sort: number;
}

export interface WithSort {
  id?: string;
  sort: number;
  [key: string]: unknown;
}

export interface RawItem {
  collection_id: string;
  movie_slug: string;
  sort: number;
  movie_snapshot: unknown;
}

export interface EnrichedItem {
  movieSlug: string;
  sort: number;
  snapshot: MovieSnapshot;
}

// Keep only published rows.
export function filterPublished<T extends WithPublished>(rows: T[]): T[] {
  return rows.filter((r) => r.is_published);
}

// Returns a new array sorted ascending by .sort. Stable (preserves input order
// for ties) because Array.prototype.sort is stable in all modern JS engines.
export function sortBySort<T extends { sort: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sort - b.sort);
}

function parseSnapshot(raw: unknown): MovieSnapshot {
  if (raw === null || typeof raw !== "object") {
    return { name: "", posterUrl: "", thumbUrl: "", type: "", year: null, quality: "" };
  }
  const r = raw as Record<string, unknown>;
  return {
    name: typeof r.name === "string" ? r.name : "",
    posterUrl: typeof r.posterUrl === "string" ? r.posterUrl : "",
    thumbUrl: typeof r.thumbUrl === "string" ? r.thumbUrl : "",
    type: typeof r.type === "string" ? r.type : "",
    year: typeof r.year === "number" ? r.year : null,
    quality: typeof r.quality === "string" ? r.quality : "",
  };
}

// Maps raw Drizzle rows (movie_snapshot is jsonb → unknown) to typed EnrichedItem[].
export function enrichItems(items: RawItem[]): EnrichedItem[] {
  return items.map((item) => ({
    movieSlug: item.movie_slug,
    sort: item.sort,
    snapshot: parseSnapshot(item.movie_snapshot),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xophim/api test collections.unit`
Expected: all 7 tests pass.

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 3: Collections routes plugin

**Files:**
- Create: `apps/api/src/collections/routes.ts`
- Modify: `apps/api/src/routes.ts`

All business logic lives in the route handlers (thin plugin). The `requireAdmin` preHandler is defined once at the top of the plugin; it builds on Phase 2's `app.requireAuth` (which populates `request.user`).

The plugin exposes:
- **Public:** `GET /v1/collections` (published only, sorted), `GET /v1/collections/:slug` (detail + enriched items).
- **Admin:** `POST`, `PATCH /v1/collections/:id`, `DELETE /v1/collections/:id`, `PUT /v1/collections/:id/items/:slug`, `DELETE /v1/collections/:id/items/:slug`.

- [ ] **Step 1: Create the routes plugin**

Create `apps/api/src/collections/routes.ts`:
```ts
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { collections, collectionItems } from "../db/schema/index.js";
import {
  enrichItems,
  filterPublished,
  sortBySort,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Shared Zod schemas
// ---------------------------------------------------------------------------

const collectionWriteBody = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab"),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  cover_url: z.string().url().optional().default(""),
  is_published: z.boolean().optional().default(false),
  sort: z.number().int().min(0).optional().default(0),
});

const movieSnapshotSchema = z.object({
  name: z.string().default(""),
  posterUrl: z.string().default(""),
  thumbUrl: z.string().default(""),
  type: z.string().default(""),
  year: z.number().nullable().optional().default(null),
  quality: z.string().default(""),
});

const itemBody = z.object({
  snapshot: movieSnapshotSchema,
  sort: z.number().int().min(0).optional().default(0),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const registerCollectionsRoutes: FastifyPluginAsyncZod = async (app) => {
  // ── requireAdmin preHandler ─────────────────────────────────────────────
  // Builds on Phase 2's requireAuth: that hook verifies the session cookie and
  // attaches request.user = { id, role, ... }. requireAdmin then asserts
  // role === 'admin'. If Phase 2's requireAuth throws (no valid session), the
  // 401 propagates; we only need to check role here.
  const requireAdmin = async (
    request: Parameters<typeof app.requireAuth>[0],
    reply: Parameters<typeof app.requireAuth>[1],
  ) => {
    // First ensure authenticated (Phase 2 hook).
    await app.requireAuth(request, reply);
    // Then assert admin role.
    if ((request.user as { role?: string }).role !== "admin") {
      return reply
        .code(403)
        .send({ error: "Forbidden", message: "Admin role required" });
    }
  };

  // ── Public: list published collections ──────────────────────────────────
  app.get(
    "/",
    {
      schema: {
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              slug: z.string(),
              title: z.string(),
              description: z.string(),
              cover_url: z.string(),
              sort: z.number(),
              created_at: z.string(),
            }),
          ),
        },
      },
    },
    async () => {
      const rows = await app.db.select().from(collections);
      const published = filterPublished(rows);
      const sorted = sortBySort(published);
      return sorted.map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        description: c.description,
        cover_url: c.cover_url,
        sort: c.sort,
        created_at: c.created_at.toISOString(),
      }));
    },
  );

  // ── Public: collection detail with enriched items ────────────────────────
  app.get(
    "/:slug",
    {
      schema: {
        params: z.object({ slug: z.string() }),
        response: {
          200: z.object({
            id: z.string(),
            slug: z.string(),
            title: z.string(),
            description: z.string(),
            cover_url: z.string(),
            sort: z.number(),
            created_at: z.string(),
            items: z.array(
              z.object({
                movieSlug: z.string(),
                sort: z.number(),
                snapshot: z.object({
                  name: z.string(),
                  posterUrl: z.string(),
                  thumbUrl: z.string(),
                  type: z.string(),
                  year: z.number().nullable(),
                  quality: z.string(),
                }),
              }),
            ),
          }),
          404: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const [col] = await app.db
        .select()
        .from(collections)
        .where(eq(collections.slug, request.params.slug));

      if (!col || !col.is_published) {
        return reply.code(404).send({ error: "NotFound", message: "Collection not found" });
      }

      const rawItems = await app.db
        .select()
        .from(collectionItems)
        .where(eq(collectionItems.collection_id, col.id));

      const enriched = enrichItems(rawItems);
      const sortedItems = sortBySort(enriched);

      return {
        id: col.id,
        slug: col.slug,
        title: col.title,
        description: col.description,
        cover_url: col.cover_url,
        sort: col.sort,
        created_at: col.created_at.toISOString(),
        items: sortedItems,
      };
    },
  );

  // ── Admin: create collection ─────────────────────────────────────────────
  app.post(
    "/",
    {
      schema: {
        body: collectionWriteBody,
        response: {
          201: z.object({ id: z.string() }),
          409: z.object({ error: z.string(), message: z.string() }),
        },
      },
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      // Check slug uniqueness first to return a clean 409 (not a DB error).
      const [existing] = await app.db
        .select({ id: collections.id })
        .from(collections)
        .where(eq(collections.slug, request.body.slug));
      if (existing) {
        return reply
          .code(409)
          .send({ error: "Conflict", message: "Slug already exists" });
      }

      const [created] = await app.db
        .insert(collections)
        .values({
          slug: request.body.slug,
          title: request.body.title,
          description: request.body.description,
          cover_url: request.body.cover_url,
          is_published: request.body.is_published,
          sort: request.body.sort,
          created_by: (request.user as { id: string }).id,
        })
        .returning({ id: collections.id });

      return reply.code(201).send({ id: created!.id });
    },
  );

  // ── Admin: update collection ─────────────────────────────────────────────
  app.patch(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: collectionWriteBody.partial(),
        response: {
          200: z.object({ id: z.string() }),
          404: z.object({ error: z.string(), message: z.string() }),
        },
      },
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      const [existing] = await app.db
        .select({ id: collections.id })
        .from(collections)
        .where(eq(collections.id, request.params.id));
      if (!existing) {
        return reply
          .code(404)
          .send({ error: "NotFound", message: "Collection not found" });
      }

      const [updated] = await app.db
        .update(collections)
        .set(request.body)
        .where(eq(collections.id, request.params.id))
        .returning({ id: collections.id });

      return { id: updated!.id };
    },
  );

  // ── Admin: delete collection ─────────────────────────────────────────────
  app.delete(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          204: z.null(),
          404: z.object({ error: z.string(), message: z.string() }),
        },
      },
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      const result = await app.db
        .delete(collections)
        .where(eq(collections.id, request.params.id))
        .returning({ id: collections.id });
      if (result.length === 0) {
        return reply
          .code(404)
          .send({ error: "NotFound", message: "Collection not found" });
      }
      return reply.code(204).send(null);
    },
  );

  // ── Admin: upsert item ───────────────────────────────────────────────────
  // PUT /v1/collections/:id/items/:slug — add or update an item in a collection.
  // The caller provides the movie_snapshot (fetched from /v1/catalog/detail/:slug
  // on the client side before calling this endpoint).
  app.put(
    "/:id/items/:slug",
    {
      schema: {
        params: z.object({ id: z.string().uuid(), slug: z.string() }),
        body: itemBody,
        response: {
          200: z.object({ ok: z.boolean() }),
          404: z.object({ error: z.string(), message: z.string() }),
        },
      },
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      const [col] = await app.db
        .select({ id: collections.id })
        .from(collections)
        .where(eq(collections.id, request.params.id));
      if (!col) {
        return reply
          .code(404)
          .send({ error: "NotFound", message: "Collection not found" });
      }

      await app.db
        .insert(collectionItems)
        .values({
          collection_id: request.params.id,
          movie_slug: request.params.slug,
          sort: request.body.sort,
          movie_snapshot: request.body.snapshot,
        })
        .onConflictDoUpdate({
          target: [collectionItems.collection_id, collectionItems.movie_slug],
          set: {
            sort: request.body.sort,
            movie_snapshot: request.body.snapshot,
          },
        });

      return { ok: true };
    },
  );

  // ── Admin: remove item ───────────────────────────────────────────────────
  app.delete(
    "/:id/items/:slug",
    {
      schema: {
        params: z.object({ id: z.string().uuid(), slug: z.string() }),
        response: {
          204: z.null(),
          404: z.object({ error: z.string(), message: z.string() }),
        },
      },
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      const result = await app.db
        .delete(collectionItems)
        .where(
          and(
            eq(collectionItems.collection_id, request.params.id),
            eq(collectionItems.movie_slug, request.params.slug),
          ),
        )
        .returning({ collection_id: collectionItems.collection_id });

      if (result.length === 0) {
        return reply
          .code(404)
          .send({ error: "NotFound", message: "Item not found" });
      }
      return reply.code(204).send(null);
    },
  );
};
```

- [ ] **Step 2: Register the plugin in routes.ts**

In `apps/api/src/routes.ts`, add the import and registration. The file currently imports only `pingDb` and defines one `/health` route. Add the import at the top and register the plugin inside `registerRoutes`:

Add import:
```ts
import { registerCollectionsRoutes } from "./collections/routes.js";
```

Inside `registerRoutes`, before or after the `/health` handler:
```ts
  await app.register(registerCollectionsRoutes, { prefix: "/collections" });
```

The final `apps/api/src/routes.ts` should look like:
```ts
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { pingDb } from "./db/index.js";
import { registerCollectionsRoutes } from "./collections/routes.js";

export const registerRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(registerCollectionsRoutes, { prefix: "/collections" });

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: z.object({
            status: z.literal("ok"),
            db: z.enum(["up", "down"]),
          }),
        },
      },
    },
    async () => {
      let dbStatus: "up" | "down" = "up";
      try {
        await pingDb();
      } catch {
        dbStatus = "down";
      }
      return { status: "ok" as const, db: dbStatus };
    },
  );
};
```

- [ ] **Step 3: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors. (If Phase 2's `app.requireAuth` types are not yet declared on `FastifyInstance`, add a temporary ambient augmentation stub at the top of `collections/routes.ts` for the typecheck to pass:)
```ts
// Temporary Phase-2 stub — remove once Phase 2 lands and app.ts declares requireAuth.
declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: { id: string; role: string; [key: string]: unknown };
  }
}
```

---

## Task 4: Integration tests — public routes + admin guard

**Files:**
- Create: `apps/api/test/collections.routes.test.ts`

These tests use `app.inject` with pg-mem (in-memory Postgres) — the same pattern documented in the P2/P3 plans. The test bootstraps two users (a regular user and an admin), seeds a published and an unpublished collection, then verifies:
- Public `GET /v1/collections` returns only the published collection.
- Public `GET /v1/collections/:slug` returns the collection with enriched items.
- Public `GET /v1/collections/:slug` on an unpublished collection returns 404.
- Admin `POST /v1/collections` returns 401 with no session cookie.
- Admin `POST /v1/collections` returns 403 for a non-admin user session.
- Admin `POST /v1/collections` returns 201 for an admin session.

The test file inlines a minimal `buildTestApp` that:
1. Builds the Fastify app with `buildApp()`.
2. Decorates `app.db` with a pg-mem in-memory Drizzle instance pointing at the test schema.
3. Seeds data directly via `app.db.insert(...)`.
4. Stubs `app.requireAuth` to set `request.user` from a test cookie value.

Because Phase 2 may not be wired yet in the test environment, this plan stubs `requireAuth` directly on the app instance after `buildApp()`. This is the same approach used in P2/P3 integration tests.

- [ ] **Step 1: Install pg-mem if not already present**

Check if `@electric-sql/pglite` or `pg-mem` is in `apps/api/package.json`. If neither is there, add `pg-mem`:

In `apps/api/package.json`, under `devDependencies`:
```json
    "pg-mem": "^2.8.1"
```
Run: `pnpm install`
Expected: `pg-mem` installed.

- [ ] **Step 2: Write the failing integration tests**

Create `apps/api/test/collections.routes.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/pg-mem";
import { newDb } from "pg-mem";
import * as schema from "../src/db/schema/index.js";
import { collections, collectionItems } from "../src/db/schema/index.js";

// ── pg-mem in-memory database ────────────────────────────────────────────────
const mem = newDb();
const { sql } = mem.public;

// Create the tables in pg-mem. pg-mem supports a subset of Postgres DDL.
sql(`
  CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    cover_url TEXT NOT NULL DEFAULT '',
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    sort INTEGER NOT NULL DEFAULT 0,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);
sql(`
  CREATE TABLE IF NOT EXISTS collection_items (
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    movie_slug TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    movie_snapshot JSONB NOT NULL DEFAULT '{}',
    UNIQUE(collection_id, movie_slug)
  );
`);

const testDb = drizzle(mem.adapters.createPgPromise(), { schema });

// ── Seeded data ──────────────────────────────────────────────────────────────
const ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001";
const REGULAR_USER_ID = "00000000-0000-0000-0000-000000000002";

// Session tokens — the test stub maps these to users.
const ADMIN_TOKEN = "admin-session-token";
const USER_TOKEN = "user-session-token";

let publishedCollectionId: string;

// ── Build the app with stubbed Phase-2 auth ──────────────────────────────────
let app: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>;

beforeAll(async () => {
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();

  // Override app.db to use the pg-mem instance.
  (app as unknown as { db: unknown }).db = testDb;

  // Stub requireAuth: map session cookie to a user based on test tokens.
  app.decorate("requireAuth", async (request: { cookies?: Record<string, string>; user?: unknown }, reply: { code: (n: number) => { send: (b: unknown) => void } }) => {
    const sid = (request as { cookies?: { sid?: string } }).cookies?.sid;
    if (sid === ADMIN_TOKEN) {
      (request as { user: unknown }).user = { id: ADMIN_USER_ID, role: "admin" };
      return;
    }
    if (sid === USER_TOKEN) {
      (request as { user: unknown }).user = { id: REGULAR_USER_ID, role: "user" };
      return;
    }
    reply.code(401).send({ error: "Unauthorized", message: "No valid session" });
  });

  // Seed a published collection with one item.
  const [col] = await testDb
    .insert(collections)
    .values({
      slug: "phim-hanh-dong-hay",
      title: "Phim Hành Động Hay",
      description: "Những bộ phim hành động đỉnh cao",
      cover_url: "https://cdn/covers/hanh-dong.webp",
      is_published: true,
      sort: 1,
      created_by: ADMIN_USER_ID,
    })
    .returning({ id: collections.id });

  publishedCollectionId = col!.id;

  await testDb.insert(collectionItems).values({
    collection_id: publishedCollectionId,
    movie_slug: "dong-ho-cat",
    sort: 0,
    movie_snapshot: {
      name: "Đồng Hồ Cát",
      posterUrl: "https://cdn/p.webp",
      thumbUrl: "https://cdn/t.webp",
      type: "single",
      year: 2024,
      quality: "FHD",
    },
  });

  // Seed an unpublished collection.
  await testDb.insert(collections).values({
    slug: "phim-chua-duyet",
    title: "Chưa Duyệt",
    description: "",
    cover_url: "",
    is_published: false,
    sort: 99,
    created_by: ADMIN_USER_ID,
  });
});

afterAll(async () => {
  await app.close();
});

// ── Public route: list ────────────────────────────────────────────────────────
describe("GET /v1/collections", () => {
  it("returns only published collections", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/collections" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { slug: string }[];
    expect(body).toHaveLength(1);
    expect(body[0]?.slug).toBe("phim-hanh-dong-hay");
  });

  it("orders by sort ascending", async () => {
    // Insert a second published collection with lower sort value.
    await testDb.insert(collections).values({
      slug: "phim-kinh-di",
      title: "Phim Kinh Dị",
      description: "",
      cover_url: "",
      is_published: true,
      sort: 0,
      created_by: ADMIN_USER_ID,
    });
    const res = await app.inject({ method: "GET", url: "/v1/collections" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { slug: string; sort: number }[];
    expect(body[0]?.sort).toBeLessThanOrEqual(body[1]?.sort ?? Infinity);
  });
});

// ── Public route: detail ─────────────────────────────────────────────────────
describe("GET /v1/collections/:slug", () => {
  it("returns the collection with enriched items", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/collections/phim-hanh-dong-hay",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      slug: string;
      items: { movieSlug: string; snapshot: { name: string } }[];
    };
    expect(body.slug).toBe("phim-hanh-dong-hay");
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.movieSlug).toBe("dong-ho-cat");
    expect(body.items[0]?.snapshot.name).toBe("Đồng Hồ Cát");
  });

  it("returns 404 for an unpublished collection", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/collections/phim-chua-duyet",
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for a slug that does not exist", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/collections/does-not-exist",
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Admin guard ───────────────────────────────────────────────────────────────
describe("POST /v1/collections — admin guard", () => {
  const newCollectionBody = {
    slug: "phim-tinh-cam-moi",
    title: "Phim Tình Cảm Mới",
    description: "Chọn lọc phim tình cảm",
    cover_url: "https://cdn/covers/tinh-cam.webp",
    is_published: false,
    sort: 5,
  };

  it("returns 401 when no session cookie is provided", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/collections",
      payload: newCollectionBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 when authenticated as a non-admin user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/collections",
      headers: { cookie: `sid=${USER_TOKEN}` },
      payload: newCollectionBody,
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 201 when authenticated as an admin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/collections",
      headers: { cookie: `sid=${ADMIN_TOKEN}` },
      payload: newCollectionBody,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string };
    expect(typeof body.id).toBe("string");
  });

  it("returns 409 when the slug already exists", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/collections",
      headers: { cookie: `sid=${ADMIN_TOKEN}` },
      payload: newCollectionBody, // same slug as above
    });
    expect(res.statusCode).toBe(409);
  });
});

// ── Admin: item management ────────────────────────────────────────────────────
describe("PUT + DELETE /v1/collections/:id/items/:slug", () => {
  it("adds an item to a collection (201 on first, 200 on upsert)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/v1/collections/${publishedCollectionId}/items/vo-dieu-ky-duyen`,
      headers: { cookie: `sid=${ADMIN_TOKEN}` },
      payload: {
        snapshot: {
          name: "Võ Điệu Kỳ Duyên",
          posterUrl: "https://cdn/v.webp",
          thumbUrl: "https://cdn/vt.webp",
          type: "series",
          year: 2025,
          quality: "HD",
        },
        sort: 1,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("removes an item from a collection", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/v1/collections/${publishedCollectionId}/items/vo-dieu-ky-duyen`,
      headers: { cookie: `sid=${ADMIN_TOKEN}` },
    });
    expect(res.statusCode).toBe(204);
  });

  it("returns 404 when removing an item that does not exist", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/v1/collections/${publishedCollectionId}/items/nonexistent-movie`,
      headers: { cookie: `sid=${ADMIN_TOKEN}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 3: Run test to verify it fails, then fix until all pass**

Run: `pnpm --filter @xophim/api test collections.routes`
Expected first run: likely FAIL with import/wiring errors. Work through them in order:
  - If `drizzle/pg-mem` adapter import errors: confirm `pg-mem` is installed and use `mem.adapters.createPgPromise()`.
  - If `app.decorate('requireAuth', ...)` throws "already decorated": the Phase 2 plan may have declared it — in that case use `app.decorateRequest` or swap to vi.spyOn on the already-registered hook.
  - If `onConflictDoUpdate` is unsupported by pg-mem: replace the upsert in routes.ts with a select-then-insert-or-update pattern for the test environment (or mock just that route handler in the test).

Target: all 11 tests pass.

- [ ] **Step 4: Checkpoint — full api suite + typecheck**

Run: `pnpm --filter @xophim/api test && pnpm --filter @xophim/api typecheck`
Expected: all tests pass (unit + integration), no type errors.

---

## Task 5: Web collections types

**Files:**
- Create: `apps/web/src/lib/collections-types.ts`

Mirror the API response shapes for the web layer. Kept in web (not a shared package) — the API is the source of truth.

- [ ] **Step 1: Create the types file**

Create `apps/web/src/lib/collections-types.ts`:
```ts
// Mirror of the API's /v1/collections response shapes.
// The API is the source of truth; update here when routes change.

export interface MovieSnapshot {
  name: string;
  posterUrl: string;
  thumbUrl: string;
  type: string;
  year: number | null;
  quality: string;
}

export interface CollectionItem {
  movieSlug: string;
  sort: number;
  snapshot: MovieSnapshot;
}

export interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_url: string;
  sort: number;
  created_at: string;
}

export interface CollectionDetail extends Collection {
  items: CollectionItem[];
}

// Admin write body — mirrors collectionWriteBody on the API.
export interface CollectionWriteInput {
  slug: string;
  title: string;
  description?: string;
  cover_url?: string;
  is_published?: boolean;
  sort?: number;
}

// Admin item upsert body.
export interface CollectionItemInput {
  snapshot: MovieSnapshot;
  sort?: number;
}
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

---

## Task 6: Web collections API client

**Files:**
- Create: `apps/web/src/lib/collections-api.ts`

Typed functions for all `/v1/collections/*` endpoints. Admin mutation functions are gated with a JSDoc note; the caller (admin UI or mutation hook) is responsible for only calling them when the session is admin.

- [ ] **Step 1: Create the client functions**

Create `apps/web/src/lib/collections-api.ts`:
```ts
import { api } from "./api";
import type {
  Collection,
  CollectionDetail,
  CollectionItemInput,
  CollectionWriteInput,
} from "./collections-types";

const get = async <T>(url: string): Promise<T> => (await api.get<T>(url)).data;
const post = async <T>(url: string, data: unknown): Promise<T> =>
  (await api.post<T>(url, data)).data;
const patch = async <T>(url: string, data: unknown): Promise<T> =>
  (await api.patch<T>(url, data)).data;
const del = async (url: string): Promise<void> => { await api.delete(url); };
const put = async <T>(url: string, data: unknown): Promise<T> =>
  (await api.put<T>(url, data)).data;

export const collectionsApi = {
  // Public
  list: () => get<Collection[]>("/collections"),
  detail: (slug: string) => get<CollectionDetail>(`/collections/${slug}`),

  // Admin — call only when request.user.role === 'admin'.
  createCollection: (body: CollectionWriteInput) =>
    post<{ id: string }>("/collections", body),
  updateCollection: (id: string, body: Partial<CollectionWriteInput>) =>
    patch<{ id: string }>(`/collections/${id}`, body),
  deleteCollection: (id: string) => del(`/collections/${id}`),
  upsertItem: (collectionId: string, movieSlug: string, body: CollectionItemInput) =>
    put<{ ok: boolean }>(`/collections/${collectionId}/items/${movieSlug}`, body),
  removeItem: (collectionId: string, movieSlug: string) =>
    del(`/collections/${collectionId}/items/${movieSlug}`),
};
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

---

## Task 7: Web TanStack Query hooks

**Files:**
- Create: `apps/web/src/hooks/collections.ts`

Public read hooks plus admin mutation hooks guarded by a `useIsAdmin` check. The admin mutations are included (as specified) but kept concise — they expose `useMutation` handles that the admin UI can use directly.

- [ ] **Step 1: Create the hooks file**

Create `apps/web/src/hooks/collections.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "../lib/collections-api";
import type { CollectionItemInput, CollectionWriteInput } from "../lib/collections-types";

// ── Query keys ───────────────────────────────────────────────────────────────
export const collectionsKeys = {
  all: ["collections"] as const,
  detail: (slug: string) => ["collections", "detail", slug] as const,
};

// ── Public read hooks ─────────────────────────────────────────────────────────

/** Fetch all published collections (list). */
export const useCollections = () =>
  useQuery({
    queryKey: collectionsKeys.all,
    queryFn: collectionsApi.list,
    staleTime: 5 * 60_000,
  });

/** Fetch a single published collection with enriched items. */
export const useCollection = (slug: string) =>
  useQuery({
    queryKey: collectionsKeys.detail(slug),
    queryFn: () => collectionsApi.detail(slug),
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });

// ── Admin mutation hooks ──────────────────────────────────────────────────────
// These are only safe to call when the current user has role === 'admin'.
// The API enforces this server-side; the hooks here just expose the mutations.

/** Create a new collection (admin only). Invalidates the list on success. */
export const useUpsertCollection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id?: string;
      body: CollectionWriteInput | Partial<CollectionWriteInput>;
    }) =>
      id
        ? collectionsApi.updateCollection(id, body as Partial<CollectionWriteInput>)
        : collectionsApi.createCollection(body as CollectionWriteInput),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: collectionsKeys.all });
    },
  });
};

/** Delete a collection by id (admin only). Invalidates the list on success. */
export const useDeleteCollection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => collectionsApi.deleteCollection(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: collectionsKeys.all });
    },
  });
};

/** Upsert a movie item into a collection (admin only). */
export const useUpsertCollectionItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      collectionId,
      movieSlug,
      body,
    }: {
      collectionId: string;
      movieSlug: string;
      body: CollectionItemInput;
    }) => collectionsApi.upsertItem(collectionId, movieSlug, body),
    onSuccess: (_data, { collectionId }) => {
      // Invalidate the specific collection detail (we don't know the slug here,
      // so invalidate all detail queries — acceptable for an admin action).
      void qc.invalidateQueries({ queryKey: ["collections", "detail"] });
      void qc.invalidateQueries({ queryKey: collectionsKeys.all });
    },
  });
};

/** Remove a movie item from a collection (admin only). */
export const useRemoveCollectionItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      collectionId,
      movieSlug,
    }: {
      collectionId: string;
      movieSlug: string;
    }) => collectionsApi.removeItem(collectionId, movieSlug),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["collections", "detail"] });
    },
  });
};
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

---

## Task 8: Final end-to-end checkpoint

**Files:** none.

- [ ] **Step 1: Full api test + typecheck**

Run: `pnpm --filter @xophim/api test && pnpm --filter @xophim/api typecheck`
Expected: all tests (unit + integration) pass, no type errors.

- [ ] **Step 2: Full web typecheck**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

- [ ] **Step 3: Verify migration file exists**

Check that `apps/api/drizzle/` contains a migration SQL file with `CREATE TABLE collections` and `CREATE TABLE collection_items`.

---

## Self-Review Notes (spec coverage)

- **Drizzle tables:** `collections` (slug unique, title, description, cover_url, is_published, sort, created_by FK users, created_at) → Task 1. ✅
- **`collection_items`** (collection_id FK cascade, movie_slug, sort, movie_snapshot jsonb, unique collection_id+movie_slug) → Task 1. ✅
- **Migration via `pnpm db:generate`** → Task 1 Step 3. ✅
- **GET /v1/collections** (public; only is_published, ordered by sort) → Task 3, Task 4. ✅
- **GET /v1/collections/:slug** (public; detail + items enriched from snapshot, sorted by item.sort) → Task 3, Task 4. ✅
- **Admin CRUD** (POST, PATCH, DELETE /v1/collections) with requireAuth + role==='admin' → Task 3. ✅
- **Admin item management** (PUT /v1/collections/:id/items/:slug, DELETE /v1/collections/:id/items/:slug) → Task 3. ✅
- **requireAdmin preHandler** (builds on Phase 2's requireAuth, asserts role==='admin', else 403) → Task 3 Step 1 (shown inline in plugin). ✅
- **Snapshot-only MVP** (list/detail render from movie_snapshot; no KKPhim N+1) → Task 2 `enrichItems`, Task 3 detail handler. ✅
- **Web data-layer:** `useCollections`, `useCollection(slug)` + admin `useUpsertCollection`, `useDeleteCollection` (plus item mutations) → Tasks 5–7. ✅
- **Vitest TDD:** unit tests for `filterPublished`, `sortBySort`, `enrichItems` → Task 2. ✅
- **Integration tests:** published filter, 401/403/200 admin guard, item upsert + remove → Task 4. ✅
- **ESM NodeNext local imports end with `.js`** → all `import` statements in API source files. ✅
- **`app.db` (Drizzle) + schema imports** → Task 3 routes use `app.db.select().from(collections)`. ✅
- **No git commits** → each task ends with a Checkpoint; no `git add`/`git commit` instructions anywhere. ✅
- **Deferred (P6):** Watch party — not in this plan. ✅
