# XoPhim — System Design Spec

**Date:** 2026-08-06
**Status:** Approved (design), pending implementation plans
**Scope:** Master architecture spec covering all 7 phases (P0–P6). Detailed implementation plans are written per-phase (starting P0+P1).

---

## 1. Overview

XoPhim is a free Vietnamese movie-streaming web app. Movie content comes from the third-party **KKPhim API** (`https://phimapi.com`, documented in [docs/kkphim.openapi.json](../../kkphim.openapi.json)); all user, community, and realtime features are backed by XoPhim's own Fastify + Postgres backend.

UI is generated separately via Stitch (see [.stitch/DESIGN.md](../../../.stitch/DESIGN.md), 10 screens). **This spec + its plans deliver backend + web data-layer only** — API endpoints, DB, auth, a typed web API client, TanStack Query hooks, and route/state skeletons. No visual components; generated UI plugs into the hooks/routes later.

### Locked decisions
- **Content strategy:** Proxy KKPhim on-demand + cache. No full-catalog ingest.
- **Cache:** In-memory LRU + TTL (no Redis; single instance for MVP).
- **Auth:** Opaque session cookie + `sessions` table in Postgres. Google via OAuth2 Authorization Code + PKCE. Guest state in localStorage, merged on login.
- **Testing:** Vitest + TDD (test-first for business logic).
- **Phasing:** 7 phases, one spec, per-phase implementation plans.

---

## 2. Architecture

Three layers, all inside the existing Fastify app (`/v1` prefix, Zod I/O, per-module plugins mirroring the existing `registerRoutes` pattern).

```
Web SPA (React)
  └─ web data-layer: axios client + TanStack Query hooks + TanStack Router
        │  calls same-origin /v1/*  (NEVER calls KKPhim directly)
        ▼
Fastify API (/v1)
  ├─ CATALOG layer → KKPhim proxy (read-only, stateless except cache)
  │     • kkphimClient (fetch + Zod-validate KKPhim responses)
  │     • in-memory LRU cache, key = normalized KKPhim URL
  │     • mapper: normalize images to absolute + unify KKPhim's two wrapper
  │       shapes into one XoPhim shape
  │     • routes: /v1/catalog/*
  │
  └─ OWN-DATA layer → Postgres (Drizzle), stateful, auth-guarded
        • auth (users, sessions, oauth_accounts)
        • user-state (watchlist, watch_progress)
        • community (comments, comment_likes, ratings, reports)
        • collections (collections, collection_items)
        • rooms (watch party)
        • routes: /v1/auth/*, /v1/me/*, /v1/movies/:slug/*, /v1/collections/*, /v1/rooms/*
```

**Principles**
- Web knows only the XoPhim API; KKPhim is fully hidden behind CATALOG. Swapping the source later never touches web.
- Every response to web passes through the **mapper** → one unified shape, so UI never sees KKPhim quirks (relative image paths, dual wrappers).
- `requireAuth` guard on `/v1/me/*` and all writes (comments, ratings).
- Each module is a Fastify plugin in its own file.

---

## 3. Data Model (Drizzle / Postgres)

Own-data only (catalog is never persisted, only cached). Movies are referenced by `movie_slug` (KKPhim natural key) — no FK to a catalog table since catalog isn't in the DB. Migrations are generated per phase, not all at once.

### AUTH (Phase 2)
```
users
  id uuid pk · username text unique (null if SSO-only) · email text unique
  password_hash text null (argon2id; null if SSO-only) · display_name text
  avatar_url text null · role text default 'user' (user|admin) · created_at timestamptz

oauth_accounts                      -- one user ↔ many providers
  id uuid pk · user_id uuid fk→users · provider text ('google') · provider_uid text (Google sub)
  unique(provider, provider_uid)

sessions
  id uuid pk (= opaque random cookie value) · user_id uuid fk→users
  expires_at timestamptz · created_at · user_agent · ip
```

### USER-STATE (Phase 3)
```
watchlist
  id · user_id fk · movie_slug text · movie_snapshot jsonb ({name,posterUrl,type,year}) · created_at
  unique(user_id, movie_slug)

watch_progress                      -- Xem Tiếp / History
  id · user_id fk · movie_slug text · episode_slug text ('full' for phim lẻ)
  server_name text · position_sec int · duration_sec int null · movie_snapshot jsonb · updated_at
  unique(user_id, movie_slug, episode_slug)
```

### COMMUNITY (Phase 4)
```
comments
  id uuid pk · user_id fk · movie_slug text · parent_id uuid null fk→comments (one-level reply)
  body text · created_at · edited_at null · deleted_at timestamptz null (soft delete)
  index(movie_slug, created_at)

comment_likes
  comment_id fk · user_id fk · unique(comment_id, user_id)

ratings
  id · user_id fk · movie_slug text · score smallint (1..5)
  unique(user_id, movie_slug)         -- avg via aggregate query

reports                              -- Báo lỗi phim
  id · user_id fk null · movie_slug text · episode_slug text null
  reason text (khong-phat|sai-phim|loi-phu-de|giat-lag) · note text null
  status text default 'open' (open|resolved) · created_at
```

### COLLECTIONS (Phase 5)
```
collections
  id uuid pk · slug text unique · title text · description text · cover_url text
  is_published bool · sort int · created_by fk→users · created_at

collection_items
  collection_id fk · movie_slug text · sort int · movie_snapshot jsonb
  unique(collection_id, movie_slug)
```

### WATCH PARTY (Phase 6)
```
rooms
  id uuid pk · code text unique (invite link) · host_user_id fk · movie_slug text
  episode_slug text · created_at · closed_at null
  -- playback state (position, playing) + chat live in memory via WebSocket;
  -- only room metadata is persisted. Chat history optional, omitted in MVP.
```

**Design notes**
- `movie_snapshot` jsonb on watchlist/history/collection lets list views render without re-calling KKPhim per item (avoids N+1). Accept mild staleness; refresh on detail open.
- Displayed movie score = **IMDb/TMDb from KKPhim** (not stored). `ratings` is the separate XoPhim user score.

---

## 4. API Surface

All under `/v1`, Zod-validated I/O. 🔓 public · 🔒 requireAuth.

### CATALOG (P0/P1) — KKPhim proxy, mapper, cache
```
🔓 GET /v1/catalog/home                 spotlight + rails (fans out to several KKPhim calls, cached)
🔓 GET /v1/catalog/list/:type           ?page,limit,sort,category,country,year
🔓 GET /v1/catalog/category/:slug       ?page,...
🔓 GET /v1/catalog/country/:slug        ?page,...
🔓 GET /v1/catalog/year/:year           ?page,...
🔓 GET /v1/catalog/search               ?keyword,page,...
🔓 GET /v1/catalog/detail/:slug         detail + episodes + IMDb/TMDb score + similar (same category)
🔓 GET /v1/catalog/categories
🔓 GET /v1/catalog/countries
🔓 GET /v1/catalog/filters              categories+countries+years in one call for the filter bar
```

### AUTH (P2)
```
🔓 POST /v1/auth/register               {username,email,password}
🔓 POST /v1/auth/login                  {usernameOrEmail,password} → set session cookie
🔒 POST /v1/auth/logout
🔓 GET  /v1/auth/google                  redirect to Google OAuth (state + PKCE)
🔓 GET  /v1/auth/google/callback         create/link user, set cookie, redirect to web
🔓 GET  /v1/auth/me                       current user | null
🔒 POST /v1/auth/merge-guest             {watchlist[],progress[]} merge guest localStorage state
```

### USER-STATE (P3)
```
🔒 GET    /v1/me/watchlist
🔒 PUT    /v1/me/watchlist/:slug        add  · 🔒 DELETE remove
🔒 GET    /v1/me/history                 Xem Tiếp + history
🔒 PUT    /v1/me/progress                {slug,episodeSlug,server,positionSec,durationSec} upsert (client-throttled)
🔒 DELETE /v1/me/history/:slug
```

### COMMUNITY (P4)
```
🔓 GET   /v1/movies/:slug/comments      ?page (with likeCount, one-level replies)
🔒 POST  /v1/movies/:slug/comments      {body,parentId?}
🔒 PATCH /v1/comments/:id  · 🔒 DELETE  (soft; owner/admin)
🔒 PUT   /v1/comments/:id/like          toggle
🔓 GET   /v1/movies/:slug/rating         {avg,count,mine?}
🔒 PUT   /v1/movies/:slug/rating         {score 1..5}
🔓 POST  /v1/reports                     {slug,episodeSlug?,reason,note?} (guests may report)
```

### COLLECTIONS (P5)
```
🔓 GET  /v1/collections                  published collections
🔓 GET  /v1/collections/:slug            detail + items (enriched from snapshot)
🔒admin POST/PATCH/DELETE /v1/collections...
```

### WATCH PARTY (P6)
```
🔒 POST /v1/rooms                        {slug,episodeSlug} → create room, returns code
🔓 GET  /v1/rooms/:code                  room metadata
   WS  /v1/rooms/:code/ws                sync {play,pause,seek}, chat, members (@fastify/websocket)
```

### Response conventions
- Mapper → XoPhim shape: `{ id, slug, name, originName, posterUrl(absolute), thumbUrl, type, year, quality, lang, episodeCurrent, imdb, tmdb, categories[], countries[] }`. Lists always `{ items[], pagination:{page,totalPages,totalItems} }`.
- Errors: existing central handler (ZodError→400, 4xx passthrough, 500 generic). Upstream KKPhim failure → **502** `{error:"UpstreamError"}` with stale-if-error fallback (serve stale cache if present).
- Existing rate-limit 100/min; writes (comment/rating) throttled tighter.

---

## 5. Cross-Cutting Concerns

### Caching (CATALOG)
- In-memory LRU, key = normalized KKPhim URL. TTL by kind: home/list/search **~5 min**, detail **~10 min**, taxonomy **~24 h**.
- **stale-if-error:** on KKPhim error/timeout, serve stale cache (even past TTL) + log; only 502 when no cache exists.
- `kkphimClient`: 10s timeout, 1 retry with backoff, Zod-validate responses (schemas from the OpenAPI doc). Schema drift → warn-log, don't crash.

### Auth flow (security-critical)
- **Passwords:** argon2id. Never logged or echoed.
- **Session:** on successful auth, create a `sessions` row (id = 32-byte random), set cookie `sid` **httpOnly, Secure, SameSite=Lax**, 30-day expiry. Each request reads `sid` → looks up session → attaches `request.user`. Logout deletes the row + clears the cookie.
- **Google OAuth2 (Authorization Code + PKCE):** `/v1/auth/google` generates `state` + `code_verifier` (stored in a short-lived cookie), redirects to Google. Callback verifies `state`, exchanges the code for tokens, reads `sub` + email. Existing `oauth_accounts(provider,sub)` → login; otherwise create a user (link if email matches) → create session.
- **Guest merge:** guests store watchlist/progress in localStorage; after login web calls `POST /v1/auth/merge-guest` to merge (upsert; never overwrite newer progress).
- **New env vars** (Zod-validated in [apps/api/src/config/env.ts](../../../apps/api/src/config/env.ts)): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SESSION_TTL_DAYS`, `WEB_ORIGIN`.

### Web data-layer (no visual components)
- `apps/web/src/lib/api.ts` (existing axios) + typed functions calling `/v1/*`; TS types declared in web.
- **TanStack Query hooks:** `useHome`, `useMovieList`, `useMovieDetail`, `useSearch`, `useAuth`, `useWatchlist`, `useProgress`, `useComments`, `useRating`, … (query keys + invalidation).
- **TanStack Router** route skeletons (loader prefetch) with empty placeholder pages; generated UI attaches to the right hook/route later.
- Guest store (Zustand + localStorage) for watchlist/progress while logged out.

### Testing (Vitest + TDD)
- **Unit:** mapper (relative→absolute image, dual-wrapper unify), cache TTL/stale-if-error, argon2 verify, session logic, guest-merge (no overwrite of newer progress), rating aggregate, comment soft-delete/permissions.
- **Integration** (Fastify `inject` + Postgres test DB / pg-mem): auth routes, requireAuth guard, watchlist upsert, comment CRUD permissions.
- **kkphimClient:** mocked HTTP (nock/msw) with fixtures captured from real responses.
- TDD: red test first for each unit of business logic. Run `pnpm --filter @xophim/api test`.

---

## 6. Phase Breakdown

| Phase | Ships | Primary tests |
|---|---|---|
| **P0 Foundation** | kkphimClient + cache + mapper + Vitest + env; `/v1/catalog/detail/:slug` demo route | mapper, cache, client |
| **P1 Catalog** | All `/v1/catalog/*` + web hooks + route skeletons for Home/Browse/Search/Watch — data ready for UI | catalog routes, hooks |
| **P2 Auth** | register/login/logout/google/me/merge + session guard + web `useAuth` + guest store | auth, oauth, session |
| **P3 User-state** | watchlist + progress/history + Xem Tiếp rail + hooks | upsert, merge, guard |
| **P4 Community** | comments + ratings + reports + hooks | permissions, aggregate, soft-delete |
| **P5 Collections** | collections + admin curation + hooks | snapshot enrich, publish |
| **P6 Watch Party** | rooms + WebSocket sync + chat (@fastify/websocket) | room state, sync |

Dependencies: P0 → P1; P0 → P2; P2 → P3, P4; P1 → P5; P1,P2 → P6. Each phase ships independently and is usable on its own.

---

## 7. Out of Scope (YAGNI / deferred)

- Full actor pages with photos/filmography — KKPhim returns actor names only (no IDs/images).
- Release/airing calendar — KKPhim has no schedule data.
- Photo galleries — KKPhim exposes `trailer_url` only.
- Multi-profile accounts, parental controls, DRM downloads, payments/ads.
- Redis / multi-instance scaling, chat history persistence for watch party.
- Visual UI components (generated via Stitch later).
