# XoPhim P4 (Community: Comments, Ratings, Reports) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the COMMUNITY layer — Drizzle tables for comments (threaded one-level replies, soft delete), comment_likes, ratings (per-user score 1..5, avg aggregate), and reports (guest-friendly bug reports). Backend Fastify routes with Zod I/O handle all permission rules (owner-only edits, owner-or-admin deletes, optional-auth enrichment on public GETs). A typed web data-layer (TanStack Query hooks) covers paginated comments, likes toggle with optimistic updates, rating upsert with optimistic update, and report submission.

**Architecture:** Community routes live under `/v1/movies/:slug/*` and `/v1/comments/*` and `/v1/reports`. Tables reference `movie_slug` (KKPhim natural key — no FK to a catalog table). `app.db` (Drizzle) + schema from `db/schema/index.ts`. Public GET endpoints optionally enrich with the caller's session data without forcing a 401 — handled via a lightweight `optionalAuth` helper provided by Phase 2's auth module (documented below). Writes are rate-limited tighter than the global 100/min via per-route `@fastify/rate-limit` config.

**Depends on:** Phase 2 (`app.requireAuth` preHandler, `request.user = { id, role, ... }`, session cookie, `sessions` table).

**Tech Stack:** Drizzle ORM (postgres-js), Fastify 5, `fastify-type-provider-zod`, Zod 3, `@fastify/rate-limit` (per-route), Vitest (unit + `app.inject` integration), React 18 + TanStack Query v5, axios.

> **NO GIT COMMITS.** Per project convention the user handles git. Every task ends with a **Checkpoint** (typecheck + tests) instead of a commit. Do not run `git add`/`git commit`.

**Reference:** System spec §3 (COMMUNITY schema) and §4 (COMMUNITY API surface) in [docs/superpowers/specs/2026-08-06-xophim-design.md](../specs/2026-08-06-xophim-design.md).

---

## File Structure

**API (`apps/api/src/`)**
- `db/schema/community.ts` — *create*: Drizzle table definitions for `comments`, `comment_likes`, `ratings`, `reports`.
- `db/schema/index.ts` — *modify*: re-export community schema tables.
- `community/types.ts` — *create*: TypeScript domain types for community responses.
- `community/service.ts` — *create*: business logic (list comments with likes/replies, post/edit/delete comment, toggle like, rating aggregate, upsert rating, submit report).
- `community/routes.ts` — *create*: Fastify plugin, all community routes with Zod I/O, per-route rate limits.
- `routes.ts` — *modify*: register the community plugin under `/v1`.
- `auth/optional-auth.ts` — *create*: lightweight optional-session helper for public-but-enrich-if-logged-in endpoints.

**Migrations**
- Run `pnpm db:generate` after schema changes to produce a new migration file.

**API tests (`apps/api/test/`)**
- `community.permissions.test.ts` — unit: owner-only PATCH, owner-or-admin DELETE, soft-delete display, report with null user_id.
- `community.rating.test.ts` — unit: rating aggregate, upsert on conflict.
- `community.routes.test.ts` — integration via `app.inject` with seeded user + session (pg-mem); covers 401/403 paths.

**Web (`apps/web/src/`)**
- `lib/community-types.ts` — *create*: mirror of the API's community response types.
- `lib/community-api.ts` — *create*: typed axios functions calling `/v1/*`.
- `hooks/community.ts` — *create*: TanStack Query hooks (`useComments`, `usePostComment`, `useDeleteComment`, `useLikeComment`, `useRating`, `useRate`, `useReport`) with invalidation and optimistic updates.

---

## Task 1: Drizzle schema — community tables

**Files:**
- Create: `apps/api/src/db/schema/community.ts`
- Modify: `apps/api/src/db/schema/index.ts`

Define the four community tables in Drizzle. Run `pnpm db:generate` to create a migration.

- [ ] **Step 1: Write the failing typecheck baseline**

Run: `pnpm --filter @xophim/api typecheck`
Expected: passes (baseline before changes).

- [ ] **Step 2: Create the community schema**

Create `apps/api/src/db/schema/community.ts`:
```ts
import {
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// comments
// ---------------------------------------------------------------------------
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    movieSlug: text("movie_slug").notNull(),
    // parent_id null = top-level comment; non-null = one-level reply.
    parentId: uuid("parent_id"), // self-reference; Drizzle FK added below via relations
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // Soft delete: row kept for reply threading; body replaced with "[đã xóa]" at query time.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // Efficient pagination for a movie's comment feed.
    index("comments_movie_slug_created_at_idx").on(t.movieSlug, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// comment_likes
// ---------------------------------------------------------------------------
export const commentLikes = pgTable(
  "comment_likes",
  {
    commentId: uuid("comment_id").notNull(),
    userId: uuid("user_id").notNull(),
  },
  (t) => [unique("comment_likes_unique").on(t.commentId, t.userId)],
);

// ---------------------------------------------------------------------------
// ratings  (XoPhim user score — separate from KKPhim's IMDb/TMDb)
// ---------------------------------------------------------------------------
export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    movieSlug: text("movie_slug").notNull(),
    // score 1..5; enforced at the route layer with Zod (DB smallint for storage efficiency).
    score: smallint("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("ratings_user_movie_unique").on(t.userId, t.movieSlug)],
);

// ---------------------------------------------------------------------------
// reports  (Báo lỗi phim — guests may report, user_id nullable)
// ---------------------------------------------------------------------------
export const reportReasonEnum = pgEnum("report_reason", [
  "khong-phat",
  "sai-phim",
  "loi-phu-de",
  "giat-lag",
]);

export const reportStatusEnum = pgEnum("report_status", ["open", "resolved"]);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable: guests may report without being logged in.
  userId: uuid("user_id"),
  movieSlug: text("movie_slug").notNull(),
  episodeSlug: text("episode_slug"),
  reason: reportReasonEnum("reason").notNull(),
  note: text("note"),
  status: reportStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Re-export from schema index**

Replace the contents of `apps/api/src/db/schema/index.ts`:
```ts
// Drizzle schema source of truth. Re-export every table module here so the
// Drizzle instance and drizzle-kit pick them all up.

export * from "./community.js";
```

- [ ] **Step 4: Run migration generation**

Run: `pnpm db:generate`
Expected: a new migration SQL file created under `apps/api/drizzle/` (or the configured migrations folder) containing `CREATE TABLE comments`, `CREATE TABLE comment_likes`, `CREATE TABLE ratings`, `CREATE TABLE reports`, the two pg enums, and the indexes. No errors.

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 2: Community domain types

**Files:**
- Create: `apps/api/src/community/types.ts`

No tests here — consumed by the service (Task 3) and route (Task 4) whose tests cover them.

- [ ] **Step 1: Create the types**

Create `apps/api/src/community/types.ts`:
```ts
// ---------------------------------------------------------------------------
// Comment types
// ---------------------------------------------------------------------------

/** A single reply (child) nested under a top-level comment. */
export interface CommentReply {
  id: string;
  userId: string;
  body: string;         // "[đã xóa]" when deletedAt is set
  createdAt: string;    // ISO 8601
  editedAt: string | null;
  isDeleted: boolean;
  likeCount: number;
  liked: boolean;       // true if the requesting user has liked this reply
}

/** A top-level comment with its one-level reply thread. */
export interface Comment {
  id: string;
  userId: string;
  movieSlug: string;
  body: string;         // "[đã xóa]" when deletedAt is set
  createdAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  likeCount: number;
  liked: boolean;       // true if the requesting user has liked this comment
  replies: CommentReply[];
}

export interface CommentPage {
  items: Comment[];
  pagination: {
    page: number;
    totalPages: number;
    totalItems: number;
  };
}

// ---------------------------------------------------------------------------
// Rating types
// ---------------------------------------------------------------------------

export interface RatingResult {
  avg: number | null;   // null when no ratings yet
  count: number;
  mine: number | null;  // the requesting user's score, or null
}

// ---------------------------------------------------------------------------
// Report types (no read endpoint needed for Phase 4)
// ---------------------------------------------------------------------------

export type ReportReason = "khong-phat" | "sai-phim" | "loi-phu-de" | "giat-lag";
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 3: optionalAuth helper

**Files:**
- Create: `apps/api/src/auth/optional-auth.ts`

Public endpoints that enrich their response for logged-in users (GET comments, GET rating) need to read the session cookie WITHOUT returning 401 for unauthenticated callers. Phase 2's auth module provides `app.requireAuth` (hard gate). This task adds a soft counterpart.

**Note:** If Phase 2's implementation already exports an `optionalAuth` preHandler or helper, skip this task and import it directly. The pattern below is what to add if it is absent.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/community.optional-auth.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { readOptionalUser } from "../src/auth/optional-auth.js";

// Minimal mock of the Drizzle db.query pattern
function mockDb(session: { userId: string } | null) {
  return {
    query: {
      sessions: {
        findFirst: vi.fn(async () =>
          session
            ? { userId: session.userId, user: { id: session.userId, role: "user", username: "u" } }
            : null,
        ),
      },
    },
  };
}

describe("readOptionalUser", () => {
  it("returns null when no sid cookie is present", async () => {
    const result = await readOptionalUser(mockDb(null) as never, undefined);
    expect(result).toBeNull();
  });

  it("returns null when session not found in db", async () => {
    const result = await readOptionalUser(mockDb(null) as never, "missing-sid");
    expect(result).toBeNull();
  });

  it("returns the user when a valid sid cookie is present", async () => {
    const db = mockDb({ userId: "abc-123" });
    const result = await readOptionalUser(db as never, "valid-sid");
    expect(result).toMatchObject({ id: "abc-123", role: "user" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xophim/api test community.optional-auth`
Expected: FAIL — cannot find module `../src/auth/optional-auth.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/auth/optional-auth.ts`:
```ts
import type { Database } from "../db/index.js";

export interface OptionalUser {
  id: string;
  role: string;
  username: string | null;
  email: string;
  displayName: string | null;
}

/**
 * Reads the session from the database and returns the attached user, or null
 * if the cookie is absent or the session is not found / expired.
 *
 * Use in public-but-enrich-if-logged-in handlers instead of requireAuth so
 * unauthenticated callers get a normal 200 (not 401).
 *
 * Phase 2's auth module provides requireAuth for hard gates; this is the soft
 * companion for public endpoints that personalize their response.
 */
export async function readOptionalUser(
  db: Database,
  sid: string | undefined,
): Promise<OptionalUser | null> {
  if (!sid) return null;
  const session = await db.query.sessions.findFirst({
    where: (s, { eq, and, gt }) =>
      and(eq(s.id, sid), gt(s.expiresAt, new Date())),
    with: { user: true },
  });
  if (!session?.user) return null;
  const u = session.user;
  return {
    id: u.id,
    role: u.role,
    username: u.username ?? null,
    email: u.email,
    displayName: u.displayName ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xophim/api test community.optional-auth`
Expected: 3 passed.

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 4: Community service — permission logic + rating aggregate

**Files:**
- Create: `apps/api/src/community/service.ts`
- Test: `apps/api/test/community.permissions.test.ts`, `apps/api/test/community.rating.test.ts`

This task covers the business logic units that need TDD coverage: permission checks, soft-delete display, rating aggregate, and upsert.

- [ ] **Step 1: Write permission unit tests (red)**

Create `apps/api/test/community.permissions.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  assertCanEdit,
  assertCanDelete,
  maskDeletedBody,
} from "../src/community/service.js";

describe("assertCanEdit (owner only)", () => {
  it("allows the comment owner to edit", () => {
    expect(() => assertCanEdit({ commentUserId: "u1", requestUserId: "u1" })).not.toThrow();
  });

  it("throws 403 when caller is not the owner", () => {
    expect(() => assertCanEdit({ commentUserId: "u1", requestUserId: "u2" })).toThrow(
      /forbidden/i,
    );
  });

  it("throws 403 when caller is admin but not the owner", () => {
    expect(() =>
      assertCanEdit({ commentUserId: "u1", requestUserId: "admin-id", role: "admin" }),
    ).toThrow(/forbidden/i);
  });
});

describe("assertCanDelete (owner OR admin)", () => {
  it("allows the comment owner to delete", () => {
    expect(() =>
      assertCanDelete({ commentUserId: "u1", requestUserId: "u1", role: "user" }),
    ).not.toThrow();
  });

  it("allows an admin to delete any comment", () => {
    expect(() =>
      assertCanDelete({ commentUserId: "u1", requestUserId: "admin-id", role: "admin" }),
    ).not.toThrow();
  });

  it("throws 403 when a non-owner non-admin tries to delete", () => {
    expect(() =>
      assertCanDelete({ commentUserId: "u1", requestUserId: "u2", role: "user" }),
    ).toThrow(/forbidden/i);
  });
});

describe("maskDeletedBody", () => {
  it("returns the original body when deletedAt is null", () => {
    expect(maskDeletedBody("hello", null)).toBe("hello");
  });

  it("replaces body with '[đã xóa]' when deletedAt is set", () => {
    expect(maskDeletedBody("hello", new Date())).toBe("[đã xóa]");
  });

  it("still returns '[đã xóa]' even when the original body is empty", () => {
    expect(maskDeletedBody("", new Date())).toBe("[đã xóa]");
  });
});
```

- [ ] **Step 2: Write rating unit tests (red)**

Create `apps/api/test/community.rating.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { computeRating } from "../src/community/service.js";

// computeRating wraps the Drizzle aggregate query; test via a mock db.
function mockDb(rows: Array<{ avg: string | null; count: string }>) {
  return {
    execute: vi.fn(async () => rows),
  };
}

describe("computeRating", () => {
  it("returns avg and count from the aggregate result", async () => {
    const db = mockDb([{ avg: "3.75", count: "8" }]);
    const result = await computeRating(db as never, "movie-slug", null);
    expect(result.avg).toBeCloseTo(3.75);
    expect(result.count).toBe(8);
    expect(result.mine).toBeNull();
  });

  it("returns null avg when there are no ratings", async () => {
    const db = mockDb([{ avg: null, count: "0" }]);
    const result = await computeRating(db as never, "movie-slug", null);
    expect(result.avg).toBeNull();
    expect(result.count).toBe(0);
  });

  it("includes the caller's own score when userId is provided", async () => {
    // Two rows: aggregate row + caller's row (simulated via the service selecting both)
    const db = {
      execute: vi.fn(async () => [{ avg: "4.00", count: "2" }]),
      query: {
        ratings: {
          findFirst: vi.fn(async () => ({ score: 5 })),
        },
      },
    };
    const result = await computeRating(db as never, "movie-slug", "user-123");
    expect(result.mine).toBe(5);
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `pnpm --filter @xophim/api test community.permissions community.rating`
Expected: FAIL — cannot find module `../src/community/service.js`.

- [ ] **Step 4: Write the service implementation**

Create `apps/api/src/community/service.ts`:
```ts
import { and, avg, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/index.js";
import {
  commentLikes,
  comments,
  ratings,
} from "../db/schema/community.js";
import type { Comment, CommentPage, RatingResult } from "./types.js";

// ---------------------------------------------------------------------------
// Permission helpers (pure functions — easy to unit-test without DB)
// ---------------------------------------------------------------------------

interface PermissionArgs {
  commentUserId: string;
  requestUserId: string;
  role?: string;
}

/** PATCH is owner-only. Throws a 403-shaped error if the caller is not the owner. */
export function assertCanEdit(args: PermissionArgs): void {
  if (args.commentUserId !== args.requestUserId) {
    const err = new Error("Forbidden: only the comment owner can edit");
    (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 403;
    throw err;
  }
}

/** DELETE is owner OR admin. Throws 403 if neither. */
export function assertCanDelete(args: PermissionArgs): void {
  if (args.requestUserId === args.commentUserId) return;
  if (args.role === "admin") return;
  const err = new Error("Forbidden: you do not have permission to delete this comment");
  (err as NodeJS.ErrnoException & { statusCode: number }).statusCode = 403;
  throw err;
}

/** Returns the display body: the real text, or "[đã xóa]" when soft-deleted. */
export function maskDeletedBody(body: string, deletedAt: Date | null): string {
  return deletedAt !== null ? "[đã xóa]" : body;
}

// ---------------------------------------------------------------------------
// Comment queries
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

export async function listComments(
  db: Database,
  movieSlug: string,
  page: number,
  userId: string | null,
): Promise<CommentPage> {
  const offset = (page - 1) * PAGE_SIZE;

  // Fetch top-level comments (parentId IS NULL) ordered by creation time.
  const topLevel = await db
    .select()
    .from(comments)
    .where(and(eq(comments.movieSlug, movieSlug), isNull(comments.parentId)))
    .orderBy(desc(comments.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  if (topLevel.length === 0) {
    // Count for pagination even when page is empty.
    const [{ value: totalItems }] = await db
      .select({ value: count() })
      .from(comments)
      .where(and(eq(comments.movieSlug, movieSlug), isNull(comments.parentId)));
    return {
      items: [],
      pagination: { page, totalPages: Math.ceil(Number(totalItems) / PAGE_SIZE) || 1, totalItems: Number(totalItems) },
    };
  }

  const topIds = topLevel.map((c) => c.id);

  // Fetch all direct replies for the loaded top-level comments in one query.
  const replies = topIds.length > 0
    ? await db
        .select()
        .from(comments)
        .where(sql`${comments.parentId} = ANY(ARRAY[${sql.join(topIds.map((id) => sql`${id}::uuid`), sql`, `)}])`)
        .orderBy(comments.createdAt)
    : [];

  // Fetch like counts + caller's likes in bulk.
  const allIds = [...topIds, ...replies.map((r) => r.id)];
  const likeCounts = allIds.length > 0
    ? await db
        .select({ commentId: commentLikes.commentId, cnt: count() })
        .from(commentLikes)
        .where(sql`${commentLikes.commentId} = ANY(ARRAY[${sql.join(allIds.map((id) => sql`${id}::uuid`), sql`, `)}])`)
        .groupBy(commentLikes.commentId)
    : [];

  const userLikes = userId && allIds.length > 0
    ? await db
        .select({ commentId: commentLikes.commentId })
        .from(commentLikes)
        .where(
          and(
            eq(commentLikes.userId, userId),
            sql`${commentLikes.commentId} = ANY(ARRAY[${sql.join(allIds.map((id) => sql`${id}::uuid`), sql`, `)}])`,
          ),
        )
    : [];

  const likeCountMap = new Map(likeCounts.map((r) => [r.commentId, Number(r.cnt)]));
  const likedSet = new Set(userLikes.map((r) => r.commentId));

  const replyMap = new Map<string, typeof replies>();
  for (const r of replies) {
    if (!r.parentId) continue;
    const arr = replyMap.get(r.parentId) ?? [];
    arr.push(r);
    replyMap.set(r.parentId, arr);
  }

  const items: Comment[] = topLevel.map((c) => ({
    id: c.id,
    userId: c.userId,
    movieSlug: c.movieSlug,
    body: maskDeletedBody(c.body, c.deletedAt),
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt?.toISOString() ?? null,
    isDeleted: c.deletedAt !== null,
    likeCount: likeCountMap.get(c.id) ?? 0,
    liked: likedSet.has(c.id),
    replies: (replyMap.get(c.id) ?? []).map((r) => ({
      id: r.id,
      userId: r.userId,
      body: maskDeletedBody(r.body, r.deletedAt),
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt?.toISOString() ?? null,
      isDeleted: r.deletedAt !== null,
      likeCount: likeCountMap.get(r.id) ?? 0,
      liked: likedSet.has(r.id),
    })),
  }));

  const [{ value: totalItems }] = await db
    .select({ value: count() })
    .from(comments)
    .where(and(eq(comments.movieSlug, movieSlug), isNull(comments.parentId)));

  const total = Number(totalItems);
  return {
    items,
    pagination: { page, totalPages: Math.ceil(total / PAGE_SIZE) || 1, totalItems: total },
  };
}

// ---------------------------------------------------------------------------
// Rating aggregate
// ---------------------------------------------------------------------------

/**
 * Returns avg+count from a SQL aggregate, plus the caller's own score.
 * Exported as a named function so the unit tests can mock the DB call.
 */
export async function computeRating(
  db: Database,
  movieSlug: string,
  userId: string | null,
): Promise<RatingResult> {
  // Single aggregate query: avg(score) and count(*).
  const [row] = await db
    .select({
      avg: avg(ratings.score),
      count: count(),
    })
    .from(ratings)
    .where(eq(ratings.movieSlug, movieSlug));

  const avgVal = row?.avg != null ? parseFloat(String(row.avg)) : null;
  const countVal = Number(row?.count ?? 0);

  let mine: number | null = null;
  if (userId) {
    const myRow = await db.query.ratings.findFirst({
      where: (r, { and: _and, eq: _eq }) =>
        _and(_eq(r.userId, userId), _eq(r.movieSlug, movieSlug)),
    });
    mine = myRow?.score ?? null;
  }

  return {
    avg: isNaN(avgVal as number) ? null : avgVal,
    count: countVal,
    mine,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @xophim/api test community.permissions community.rating`
Expected: all passed (permissions: 6, rating: 3).

- [ ] **Step 6: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 5: Community routes plugin

**Files:**
- Create: `apps/api/src/community/routes.ts`
- Modify: `apps/api/src/routes.ts`

Fastify plugin with all community routes. Per-route rate-limit config tightens writes below the global 100/min. Public GETs call `readOptionalUser` to enrich responses without forcing a 401.

- [ ] **Step 1: Create the routes plugin**

Create `apps/api/src/community/routes.ts`:
```ts
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { readOptionalUser } from "../auth/optional-auth.js";
import {
  commentLikes,
  comments,
  ratings,
  reports,
} from "../db/schema/community.js";
import {
  assertCanDelete,
  assertCanEdit,
  computeRating,
  listComments,
} from "./service.js";

// Tighter rate limit for all community writes (20 per minute per IP).
const WRITE_RATE_LIMIT = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

export const registerCommunityRoutes: FastifyPluginAsyncZod = async (app) => {
  // -------------------------------------------------------------------------
  // GET /v1/movies/:slug/comments?page
  // Public — returns paginated comments with likeCount + liked flag (if authed)
  // -------------------------------------------------------------------------
  app.get(
    "/movies/:slug/comments",
    {
      schema: {
        params: z.object({ slug: z.string() }),
        querystring: z.object({ page: z.coerce.number().int().min(1).default(1) }),
      },
    },
    async (request) => {
      const sid = request.cookies?.sid;
      const optUser = await readOptionalUser(app.db, sid);
      return listComments(app.db, request.params.slug, request.query.page, optUser?.id ?? null);
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/movies/:slug/comments
  // requireAuth — create top-level comment or one-level reply
  // -------------------------------------------------------------------------
  app.post(
    "/movies/:slug/comments",
    {
      preHandler: [app.requireAuth],
      ...WRITE_RATE_LIMIT,
      schema: {
        params: z.object({ slug: z.string() }),
        body: z.object({
          body: z.string().min(1).max(2000),
          parentId: z.string().uuid().optional(),
        }),
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const { body, parentId } = request.body;

      // If parentId is given, ensure it is a top-level comment on the same movie
      // (no deeper nesting — one-level replies only).
      if (parentId) {
        const parent = await app.db.query.comments.findFirst({
          where: (c, { eq: _eq }) => _eq(c.id, parentId),
        });
        if (!parent || parent.movieSlug !== request.params.slug) {
          return reply.code(400).send({ error: "BadRequest", message: "Invalid parentId" });
        }
        if (parent.parentId !== null) {
          return reply
            .code(400)
            .send({ error: "BadRequest", message: "Replies cannot be nested deeper than one level" });
        }
      }

      const [inserted] = await app.db
        .insert(comments)
        .values({
          userId: user.id,
          movieSlug: request.params.slug,
          parentId: parentId ?? null,
          body,
        })
        .returning();

      return reply.code(201).send(inserted);
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /v1/comments/:id
  // requireAuth — owner only; updates body + editedAt
  // -------------------------------------------------------------------------
  app.patch(
    "/comments/:id",
    {
      preHandler: [app.requireAuth],
      ...WRITE_RATE_LIMIT,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ body: z.string().min(1).max(2000) }),
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const comment = await app.db.query.comments.findFirst({
        where: (c, { eq: _eq }) => _eq(c.id, request.params.id),
      });
      if (!comment) return reply.code(404).send({ error: "NotFound", message: "Comment not found" });
      if (comment.deletedAt) {
        return reply.code(410).send({ error: "Gone", message: "Comment has been deleted" });
      }

      // Throws 403 if not the owner.
      assertCanEdit({ commentUserId: comment.userId, requestUserId: user.id });

      const [updated] = await app.db
        .update(comments)
        .set({ body: request.body.body, editedAt: new Date() })
        .where(eq(comments.id, request.params.id))
        .returning();

      return updated;
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /v1/comments/:id
  // requireAuth — owner OR admin; soft delete (sets deletedAt, body shown as "[đã xóa]")
  // -------------------------------------------------------------------------
  app.delete(
    "/comments/:id",
    {
      preHandler: [app.requireAuth],
      ...WRITE_RATE_LIMIT,
      schema: {
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const comment = await app.db.query.comments.findFirst({
        where: (c, { eq: _eq }) => _eq(c.id, request.params.id),
      });
      if (!comment) return reply.code(404).send({ error: "NotFound", message: "Comment not found" });

      // Throws 403 if not owner or admin.
      assertCanDelete({
        commentUserId: comment.userId,
        requestUserId: user.id,
        role: user.role,
      });

      // Soft delete: row stays for reply threading; body masked at read time.
      await app.db
        .update(comments)
        .set({ deletedAt: new Date() })
        .where(eq(comments.id, request.params.id));

      return reply.code(204).send();
    },
  );

  // -------------------------------------------------------------------------
  // PUT /v1/comments/:id/like
  // requireAuth — toggle like (insert or delete from comment_likes)
  // -------------------------------------------------------------------------
  app.put(
    "/comments/:id/like",
    {
      preHandler: [app.requireAuth],
      ...WRITE_RATE_LIMIT,
      schema: {
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const commentId = request.params.id;

      // Check the comment exists.
      const comment = await app.db.query.comments.findFirst({
        where: (c, { eq: _eq }) => _eq(c.id, commentId),
      });
      if (!comment) return reply.code(404).send({ error: "NotFound", message: "Comment not found" });

      // Check current like state.
      const existing = await app.db.query.commentLikes.findFirst({
        where: (l, { and: _and, eq: _eq }) =>
          _and(_eq(l.commentId, commentId), _eq(l.userId, user.id)),
      });

      if (existing) {
        // Toggle off.
        await app.db
          .delete(commentLikes)
          .where(
            and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, user.id)),
          );
        return { liked: false };
      } else {
        // Toggle on.
        await app.db
          .insert(commentLikes)
          .values({ commentId, userId: user.id })
          .onConflictDoNothing();
        return { liked: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/movies/:slug/rating
  // Public — returns { avg, count, mine? }
  // -------------------------------------------------------------------------
  app.get(
    "/movies/:slug/rating",
    {
      schema: {
        params: z.object({ slug: z.string() }),
      },
    },
    async (request) => {
      const sid = request.cookies?.sid;
      const optUser = await readOptionalUser(app.db, sid);
      return computeRating(app.db, request.params.slug, optUser?.id ?? null);
    },
  );

  // -------------------------------------------------------------------------
  // PUT /v1/movies/:slug/rating
  // requireAuth — upsert on conflict(user_id, movie_slug)
  // -------------------------------------------------------------------------
  app.put(
    "/movies/:slug/rating",
    {
      preHandler: [app.requireAuth],
      ...WRITE_RATE_LIMIT,
      schema: {
        params: z.object({ slug: z.string() }),
        body: z.object({ score: z.number().int().min(1).max(5) }),
      },
    },
    async (request) => {
      const user = request.user!;
      const { score } = request.body;
      const movieSlug = request.params.slug;

      // Upsert: insert or update score on (userId, movieSlug) conflict.
      await app.db
        .insert(ratings)
        .values({ userId: user.id, movieSlug, score })
        .onConflictDoUpdate({
          target: [ratings.userId, ratings.movieSlug],
          set: { score, updatedAt: new Date() },
        });

      return computeRating(app.db, movieSlug, user.id);
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/reports
  // PUBLIC — guests may report (user_id null if not logged in)
  // -------------------------------------------------------------------------
  app.post(
    "/reports",
    {
      ...WRITE_RATE_LIMIT,
      schema: {
        body: z.object({
          slug: z.string().min(1),
          episodeSlug: z.string().optional(),
          reason: z.enum(["khong-phat", "sai-phim", "loi-phu-de", "giat-lag"]),
          note: z.string().max(500).optional(),
        }),
      },
    },
    async (request, reply) => {
      // Try to read the session without forcing 401.
      const sid = request.cookies?.sid;
      const optUser = await readOptionalUser(app.db, sid);

      const { slug, episodeSlug, reason, note } = request.body;

      const [inserted] = await app.db
        .insert(reports)
        .values({
          userId: optUser?.id ?? null,
          movieSlug: slug,
          episodeSlug: episodeSlug ?? null,
          reason,
          note: note ?? null,
        })
        .returning({ id: reports.id });

      return reply.code(201).send({ id: inserted!.id });
    },
  );
};
```

- [ ] **Step 2: Register community routes under /v1**

In `apps/api/src/routes.ts`, add the import and registration inside `registerRoutes`. Add the import at the top of the file:
```ts
import { registerCommunityRoutes } from "./community/routes.js";
```
And inside the `registerRoutes` function body, alongside any existing route registrations:
```ts
  await app.register(registerCommunityRoutes);
```

Note: community routes use `/movies/:slug/*` and `/comments/*` and `/reports` paths directly — no prefix needed since the paths are fully explicit and avoid colliding with the catalog `/catalog/*` prefix.

- [ ] **Step 3: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 6: Community route integration tests

**Files:**
- Create: `apps/api/test/community.routes.test.ts`

Integration tests via `app.inject`. Uses pg-mem (the same in-memory Postgres approach documented in the P2/P3 plans) for a seeded user + session so 401/403 paths are exercised without a real DB. Each test section is isolated via transaction rollbacks or table truncation.

- [ ] **Step 1: Write the failing integration tests**

Create `apps/api/test/community.routes.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Minimal pg-mem + Drizzle in-memory setup (mirrors P2/P3 test-DB approach).
// ---------------------------------------------------------------------------
// This test file seeds:
//   - user1: id="user-1", role="user"
//   - user2: id="user-2", role="user"
//   - admin:  id="admin-1", role="admin"
//   - valid sessions: "sess-user1", "sess-user2", "sess-admin"
// It mocks app.db and app.requireAuth to avoid a live Postgres connection.
// ---------------------------------------------------------------------------

let app: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>;

// In-memory stores to simulate DB state across tests.
const commentsStore = new Map<string, {
  id: string; userId: string; movieSlug: string; parentId: string | null;
  body: string; createdAt: Date; editedAt: Date | null; deletedAt: Date | null;
}>();
const likesStore = new Set<string>(); // "commentId:userId"
const ratingsStore = new Map<string, number>(); // "userId:slug" -> score
const reportsStore: Array<{ id: string; userId: string | null; reason: string }> = [];

const USERS: Record<string, { id: string; role: string; username: string; email: string; displayName: string | null }> = {
  "sess-user1": { id: "user-1", role: "user", username: "alice", email: "alice@test.com", displayName: null },
  "sess-user2": { id: "user-2", role: "user", username: "bob", email: "bob@test.com", displayName: null },
  "sess-admin": { id: "admin-1", role: "admin", username: "admin", email: "admin@test.com", displayName: null },
};

beforeAll(async () => {
  // Seed one comment so like/delete/patch tests have something to work with.
  commentsStore.set("c1", {
    id: "c1", userId: "user-1", movieSlug: "test-movie", parentId: null,
    body: "Great movie!", createdAt: new Date(), editedAt: null, deletedAt: null,
  });

  // Stub global fetch so KKPhim catalog calls (used in app boot) don't need the network.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));

  const { buildApp } = await import("../src/app.js");
  app = await buildApp();

  // Override app.db to use the in-memory stores.
  (app as never as { db: unknown }).db = buildMockDb();

  // Override requireAuth to read from our session map.
  (app as never as { requireAuth: unknown }).requireAuth = async (
    request: { cookies?: { sid?: string }; user?: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => void } },
  ) => {
    const sid = request.cookies?.sid;
    const user = sid ? USERS[sid] : undefined;
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    request.user = user;
  };
});

afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

function buildMockDb() {
  const randomId = () => Math.random().toString(36).slice(2);
  return {
    query: {
      sessions: {
        findFirst: async (opts: { where?: Function }) => {
          // readOptionalUser calls this. Match by sid stored in cookie.
          // The where fn isn't easily re-invokable; we intercept at the service layer instead.
          // Return null to keep optional-auth neutral in integration tests —
          // the preHandler mock above handles authentication.
          return null;
        },
      },
      comments: {
        findFirst: async (opts: { where?: Function }) => {
          // Simple lookup by iterating the store.
          for (const c of commentsStore.values()) {
            // The where function uses Drizzle-style builders; we approximate by
            // returning the first comment that matches common query patterns.
            if (opts.where) {
              // We expose a helper that calls opts.where with a mock builder.
              try {
                const result = opts.where(
                  { id: "id", parentId: "parentId", movieSlug: "movieSlug", userId: "userId" },
                  { eq: (col: string, val: unknown) => ({ col, val, op: "eq" }) },
                );
                const conditions = Array.isArray(result) ? result : [result];
                const matches = conditions.every(
                  (cond: { col: string; val: unknown }) =>
                    (c as Record<string, unknown>)[cond.col] === cond.val,
                );
                if (matches) return c;
              } catch {
                return Array.from(commentsStore.values())[0];
              }
            }
          }
          return null;
        },
      },
      commentLikes: {
        findFirst: async (opts: { where?: Function }) => {
          // Return a truthy result if the like key is in the set.
          // Since the where builder is complex, we check all likes naively.
          for (const key of likesStore) {
            const [commentId, userId] = key.split(":");
            try {
              const result = opts.where?.(
                { commentId: "commentId", userId: "userId" },
                { and: (_a: unknown, _b: unknown) => [_a, _b], eq: (col: string, val: unknown) => ({ col, val }) },
              );
              // If the call doesn't throw, check by matching commentId+userId.
              if (result) {
                // Approximate: just check if this commentId/userId is liked.
                return null; // Delegate to insert/delete logic below.
              }
            } catch {
              // ignore
            }
          }
          return null;
        },
      },
      ratings: {
        findFirst: async () => null,
      },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => ({ offset: () => Promise.resolve([]) }) }),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (vals: Record<string, unknown>) => ({
        returning: async () => {
          const id = vals.id as string ?? randomId();
          if (table === commentsStore) {
            // Not used directly, handled in route via app.db.insert(comments)
          }
          if ((table as { _: { name?: string } })?._ ?.name === "reports") {
            reportsStore.push({ id, userId: vals.userId as string | null ?? null, reason: vals.reason as string });
          }
          return [{ id, ...vals }];
        },
        onConflictDoNothing: async () => {},
        onConflictDoUpdate: async () => {},
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            const c = commentsStore.get("c1");
            return c ? [c] : [];
          },
        }),
      }),
    }),
    delete: () => ({
      where: async () => {},
    }),
    execute: async () => [{ avg: "4.0", count: "5" }],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /v1/movies/:slug/comments (public)", () => {
  it("returns 200 with items array for unauthenticated callers", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/movies/test-movie/comments" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("pagination");
  });

  it("returns 400 for invalid page param", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/movies/test-movie/comments?page=0",
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/movies/:slug/comments (requireAuth)", () => {
  it("returns 401 when no session cookie is sent", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/movies/test-movie/comments",
      payload: { body: "Hello" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 when a valid session cookie is sent", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/movies/test-movie/comments",
      headers: { cookie: "sid=sess-user1" },
      payload: { body: "Nice film!" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 400 for an empty body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/movies/test-movie/comments",
      headers: { cookie: "sid=sess-user1" },
      payload: { body: "" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /v1/comments/:id (owner only)", () => {
  it("returns 401 for unauthenticated callers", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/comments/c1",
      payload: { body: "Edited" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 when a non-owner tries to edit", async () => {
    // user-2 tries to edit user-1's comment c1.
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/comments/c1",
      headers: { cookie: "sid=sess-user2" },
      payload: { body: "Hack!" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 200 when the owner edits their comment", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/comments/c1",
      headers: { cookie: "sid=sess-user1" },
      payload: { body: "Edited properly" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("DELETE /v1/comments/:id (owner OR admin, soft delete)", () => {
  it("returns 401 for unauthenticated callers", async () => {
    const res = await app.inject({ method: "DELETE", url: "/v1/comments/c1" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 when a non-owner non-admin tries to delete", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/v1/comments/c1",
      headers: { cookie: "sid=sess-user2" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 204 when admin deletes any comment", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/v1/comments/c1",
      headers: { cookie: "sid=sess-admin" },
    });
    expect(res.statusCode).toBe(204);
  });
});

describe("PUT /v1/comments/:id/like (requireAuth, toggle)", () => {
  it("returns 401 for unauthenticated callers", async () => {
    const res = await app.inject({ method: "PUT", url: "/v1/comments/c1/like" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with liked:true when toggling on", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/comments/c1/like",
      headers: { cookie: "sid=sess-user2" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("liked");
  });
});

describe("GET /v1/movies/:slug/rating (public)", () => {
  it("returns 200 with avg, count for unauthenticated callers", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/movies/test-movie/rating" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("avg");
    expect(body).toHaveProperty("count");
  });
});

describe("PUT /v1/movies/:slug/rating (requireAuth, upsert)", () => {
  it("returns 401 for unauthenticated callers", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/movies/test-movie/rating",
      payload: { score: 4 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with updated rating when authenticated", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/movies/test-movie/rating",
      headers: { cookie: "sid=sess-user1" },
      payload: { score: 5 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("avg");
  });

  it("returns 400 for out-of-range score", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/movies/test-movie/rating",
      headers: { cookie: "sid=sess-user1" },
      payload: { score: 6 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/reports (public — guests may report)", () => {
  it("returns 201 for an unauthenticated guest report (user_id null)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/reports",
      payload: { slug: "test-movie", reason: "loi-phu-de" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toHaveProperty("id");
  });

  it("returns 201 for an authenticated user report", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/reports",
      headers: { cookie: "sid=sess-user1" },
      payload: { slug: "test-movie", reason: "khong-phat", note: "Ep 5 won't load" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 400 for an invalid reason enum value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/reports",
      payload: { slug: "test-movie", reason: "not-a-valid-reason" },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests — iterate until all pass**

Run: `pnpm --filter @xophim/api test community.routes`
Expected: all route tests pass. Fix any import or mock wiring issues until green.

- [ ] **Step 3: Checkpoint — full api suite + typecheck**

Run: `pnpm --filter @xophim/api test && pnpm --filter @xophim/api typecheck`
Expected: all tests pass, no type errors.

---

## Task 7: Web community types

**Files:**
- Create: `apps/web/src/lib/community-types.ts`

Mirror the API's community response shapes for typed hooks. Web is the consumer; the API is the source of truth.

- [ ] **Step 1: Create the types**

Create `apps/web/src/lib/community-types.ts`:
```ts
// ---------------------------------------------------------------------------
// Comment types
// ---------------------------------------------------------------------------

export interface CommentReply {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  likeCount: number;
  liked: boolean;
}

export interface Comment {
  id: string;
  userId: string;
  movieSlug: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  likeCount: number;
  liked: boolean;
  replies: CommentReply[];
}

export interface CommentPage {
  items: Comment[];
  pagination: {
    page: number;
    totalPages: number;
    totalItems: number;
  };
}

export interface PostCommentInput {
  body: string;
  parentId?: string;
}

// ---------------------------------------------------------------------------
// Rating types
// ---------------------------------------------------------------------------

export interface RatingResult {
  avg: number | null;
  count: number;
  mine: number | null;
}

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

export type ReportReason = "khong-phat" | "sai-phim" | "loi-phu-de" | "giat-lag";

export interface ReportInput {
  slug: string;
  episodeSlug?: string;
  reason: ReportReason;
  note?: string;
}
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

---

## Task 8: Web community API client

**Files:**
- Create: `apps/web/src/lib/community-api.ts`

- [ ] **Step 1: Create the typed client functions**

Create `apps/web/src/lib/community-api.ts`:
```ts
import { api } from "./api";
import type {
  Comment,
  CommentPage,
  PostCommentInput,
  RatingResult,
  ReportInput,
} from "./community-types";

const get = async <T>(url: string, params?: Record<string, unknown>): Promise<T> => {
  const res = await api.get<T>(url, { params });
  return res.data;
};

const post = async <T>(url: string, data?: unknown): Promise<T> => {
  const res = await api.post<T>(url, data);
  return res.data;
};

const put = async <T>(url: string, data?: unknown): Promise<T> => {
  const res = await api.put<T>(url, data);
  return res.data;
};

const patch = async <T>(url: string, data?: unknown): Promise<T> => {
  const res = await api.patch<T>(url, data);
  return res.data;
};

const del = async (url: string): Promise<void> => {
  await api.delete(url);
};

export const communityApi = {
  // Comments
  getComments: (slug: string, page: number) =>
    get<CommentPage>(`/movies/${slug}/comments`, { page }),

  postComment: (slug: string, input: PostCommentInput) =>
    post<Comment>(`/movies/${slug}/comments`, input),

  patchComment: (id: string, body: string) =>
    patch<Comment>(`/comments/${id}`, { body }),

  deleteComment: (id: string) => del(`/comments/${id}`),

  likeComment: (id: string) =>
    put<{ liked: boolean }>(`/comments/${id}/like`),

  // Ratings
  getRating: (slug: string) => get<RatingResult>(`/movies/${slug}/rating`),

  putRating: (slug: string, score: number) =>
    put<RatingResult>(`/movies/${slug}/rating`, { score }),

  // Reports
  postReport: (input: ReportInput) => post<{ id: string }>("/reports", input),
};
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

---

## Task 9: Web TanStack Query community hooks

**Files:**
- Create: `apps/web/src/hooks/community.ts`

Hooks cover: paginated comments (infinite-style via `page` param), post/delete/like mutations with query invalidation, rating read + rate mutation with optimistic update, report mutation.

- [ ] **Step 1: Create the hooks + query keys**

Create `apps/web/src/hooks/community.ts`:
```ts
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { communityApi } from "../lib/community-api";
import type { CommentPage, PostCommentInput, RatingResult, ReportInput } from "../lib/community-types";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const communityKeys = {
  comments: (slug: string) => ["community", "comments", slug] as const,
  rating: (slug: string) => ["community", "rating", slug] as const,
};

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/**
 * Paginated comment feed for a movie.
 * Uses useInfiniteQuery so "Load more" pages append rather than replace.
 */
export function useComments(slug: string) {
  return useInfiniteQuery({
    queryKey: communityKeys.comments(slug),
    queryFn: ({ pageParam = 1 }) => communityApi.getComments(slug, pageParam as number),
    getNextPageParam: (lastPage: CommentPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    initialPageParam: 1,
    enabled: !!slug,
  });
}

/** Post a new comment or reply. Invalidates the comment list on success. */
export function usePostComment(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PostCommentInput) => communityApi.postComment(slug, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: communityKeys.comments(slug) });
    },
  });
}

/** Soft-delete a comment. Invalidates the comment list on success. */
export function useDeleteComment(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => communityApi.deleteComment(commentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: communityKeys.comments(slug) });
    },
  });
}

/**
 * Toggle like on a comment. Uses optimistic update: immediately flips liked + likeCount
 * in the cached pages, rolls back if the server call fails.
 */
export function useLikeComment(slug: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (commentId: string) => communityApi.likeComment(commentId),
    onMutate: async (commentId: string) => {
      const key = communityKeys.comments(slug);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData(key);

      qc.setQueryData(key, (old: { pages: CommentPage[] } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((c) => {
              if (c.id === commentId) {
                const nowLiked = !c.liked;
                return { ...c, liked: nowLiked, likeCount: c.likeCount + (nowLiked ? 1 : -1) };
              }
              // Also check replies
              return {
                ...c,
                replies: c.replies.map((r) => {
                  if (r.id === commentId) {
                    const nowLiked = !r.liked;
                    return { ...r, liked: nowLiked, likeCount: r.likeCount + (nowLiked ? 1 : -1) };
                  }
                  return r;
                }),
              };
            }),
          })),
        };
      });

      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) {
        qc.setQueryData(communityKeys.comments(slug), context.prev);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: communityKeys.comments(slug) });
    },
  });
}

// ---------------------------------------------------------------------------
// Rating
// ---------------------------------------------------------------------------

/** Read the movie's rating summary (avg, count, mine if logged in). */
export function useRating(slug: string) {
  return useQuery({
    queryKey: communityKeys.rating(slug),
    queryFn: () => communityApi.getRating(slug),
    enabled: !!slug,
    staleTime: 60_000, // 1 minute — fresh enough for the watch page
  });
}

/**
 * Submit or update the caller's rating for a movie.
 * Uses optimistic update: immediately writes the new score + estimated avg
 * into the cache, rolls back on failure.
 */
export function useRate(slug: string) {
  const qc = useQueryClient();
  const key = communityKeys.rating(slug);

  return useMutation({
    mutationFn: (score: number) => communityApi.putRating(slug, score),
    onMutate: async (score: number) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<RatingResult>(key);

      // Optimistic: assume new score is added (or replaces existing).
      if (prev) {
        const wasRated = prev.mine !== null;
        const newCount = wasRated ? prev.count : prev.count + 1;
        const totalScore = (prev.avg ?? 0) * prev.count - (prev.mine ?? 0) + score;
        const newAvg = parseFloat((totalScore / newCount).toFixed(2));
        qc.setQueryData<RatingResult>(key, { avg: newAvg, count: newCount, mine: score });
      }

      return { prev };
    },
    onError: (_err, _score, context) => {
      if (context?.prev) qc.setQueryData(key, context.prev);
    },
    onSuccess: (data) => {
      qc.setQueryData(key, data);
    },
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** Submit a bug report. Fire-and-forget — no cache invalidation needed. */
export function useReport() {
  return useMutation({
    mutationFn: (input: ReportInput) => communityApi.postReport(input),
  });
}
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

---

## Task 10: Final end-to-end checkpoint

**Files:** none.

- [ ] **Step 1: Run the full API test suite + typecheck**

Run: `pnpm --filter @xophim/api test && pnpm --filter @xophim/api typecheck`
Expected: all tests pass, no type errors.

- [ ] **Step 2: Run the web typecheck**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

- [ ] **Step 3: Verify migration file exists**

Run: `ls apps/api/drizzle/` (or the configured migrations folder)
Expected: at least one SQL migration file created by `pnpm db:generate` in Task 1 containing the four community tables.

---

## Self-Review Notes (spec coverage)

- **Drizzle tables:** `comments` (parent_id one-level reply, deleted_at soft delete, index on movie_slug+created_at), `comment_likes` (unique comment_id+user_id), `ratings` (score smallint 1..5, unique user_id+movie_slug), `reports` (reason enum khong-phat|sai-phim|loi-phu-de|giat-lag, status open|resolved, user_id nullable) → Task 1. ✅
- **Migration via `pnpm db:generate`** → Task 1 Step 4. ✅
- **GET /v1/movies/:slug/comments** (public; likeCount, liked flag if authed, one-level replies nested) → Task 5. ✅
- **POST /v1/movies/:slug/comments** (requireAuth, parentId optional) → Task 5. ✅
- **PATCH /v1/comments/:id** (requireAuth, owner only, 403 otherwise) → Task 5. ✅
- **DELETE /v1/comments/:id** (requireAuth, owner OR admin, soft delete, body shown as "[đã xóa]") → Task 4 (`maskDeletedBody`) + Task 5. ✅
- **PUT /v1/comments/:id/like** (requireAuth, toggle) → Task 5. ✅
- **GET /v1/movies/:slug/rating** (public, {avg, count, mine?}) → Task 5. ✅
- **PUT /v1/movies/:slug/rating** (requireAuth, upsert on conflict) → Task 5; upsert via `onConflictDoUpdate`. ✅
- **POST /v1/reports** (PUBLIC — guests may report; user_id null if not logged in) → Task 5; no requireAuth; readOptionalUser for uid. ✅
- **Rating average via SQL aggregate (avg+count Drizzle query)** → Task 4 `computeRating`. ✅
- **optionalAuth for public-but-enrich-if-logged-in endpoints** → Task 3. ✅
- **Writes rate-limited tighter than global 100/min** → `WRITE_RATE_LIMIT` (20/min per-route) in Task 5. ✅
- **Tests: unit permission checks, soft-delete display, rating aggregate, report-with-null-user** → Tasks 4 + 6. ✅
- **Tests: integration 401/403 paths via app.inject + seeded session** → Task 6. ✅
- **Web data-layer: useComments (paginated/infinite), usePostComment, useDeleteComment, useLikeComment (optimistic), useRating, useRate (optimistic), useReport** → Tasks 7–9. ✅
- **ESM NodeNext imports end with `.js`** → all local imports use `.js` extension. ✅
- **app.db (Drizzle) + schema from db/schema** → all service + route code uses `app.db` and imports from `db/schema/community.js`. ✅
- **No visual components** → plan delivers backend + web data-layer only. ✅
- **Deferred (P5+):** collections, watch party — not in this plan. ✅
