# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

XoPhim — movie streaming website. Currently a **scaffold only**: API has `GET /v1/health`, web is a placeholder page, DB schema is empty. No auth, catalog, search, or player yet. When adding features, follow the wiring patterns already established rather than inventing new ones.

**Content source**: movie data comes from the third-party KKPhim API (`https://phimapi.com`). Its full contract is documented as an OpenAPI 3.1 spec at [docs/kkphim.openapi.json](docs/kkphim.openapi.json) — read it before implementing catalog/detail/search/player features. Key gotchas noted there: `/v1/api/*` endpoints return **relative** image paths (prefix with `APP_DOMAIN_CDN_IMAGE` = `https://phimimg.com`) while latest-feed and `/phim/{slug}` return absolute URLs; playable streams are `episodes[].server_data[].link_m3u8` (HLS).

## Commands (repo root)

```bash
pnpm dev            # api (:6001) + web (:5173) in parallel via turbo
pnpm build          # build all
pnpm typecheck      # tsc across workspaces

# DB (Drizzle) — schema lives in apps/api/src/db/schema/index.ts
pnpm db:generate    # generate SQL migrations from schema → apps/api/drizzle/
pnpm db:migrate     # apply migrations
pnpm db:push        # push schema directly (dev only)
```

Per-app: `pnpm --filter @xophim/api <script>` / `pnpm --filter @xophim/web <script>`.
API-only extras: `db:studio` (Drizzle Studio). Web build runs `tsc -b && vite build`.

No test runner is configured yet.

## Architecture

pnpm workspace (`apps/*`) orchestrated by turbo. Two apps:

- **`@xophim/api`** — Fastify 5, runs via `tsx` (no compiled build; typecheck is `noEmit`). ESM with **explicit `.js` import extensions** (NodeNext) — imports of local `.ts` files must be written `./foo.js`.
- **`@xophim/web`** — Vite 5 + React 18 SPA. TanStack Router + Query, Zustand, Tailwind (dark-first), axios. `@/*` path alias → `src/*`.

### Single-image deploy model (important)

There is **one** deployable artifact, not two. The [Dockerfile](Dockerfile) builds the Vite SPA, then the Fastify API serves those static files:
- [apps/api/src/app.ts](apps/api/src/app.ts) registers `@fastify/static` + a SPA fallback `notFoundHandler` **only when `WEB_STATIC_DIR` is set** and the dir exists.
- The SPA fallback serves `index.html` for any non-`/v1`, non-`/assets/` GET. Keep new API routes under `/v1` so they don't get swallowed by the fallback.
- PostgreSQL is **external** (not containerized) — reached via `host.docker.internal` from the container.

In dev the two run separately: Vite proxies `/v1` → `http://localhost:6001` ([apps/web/vite.config.ts](apps/web/vite.config.ts)), so the SPA always uses a relative `/v1` base and CORS is avoided.

### API conventions

- **Zod is the single source of truth for I/O.** App uses `ZodTypeProvider`; routes declare `schema.response`/`schema.body` with Zod and use the `FastifyPluginAsyncZod` type. Follow [apps/api/src/routes.ts](apps/api/src/routes.ts) as the template.
- **All routes mount under `/v1`** (prefix set in `app.ts`). Register feature modules there: `await app.register(moviesRoutes, { prefix: "/movies" })`.
- **Env is validated once at boot** in [apps/api/src/config/env.ts](apps/api/src/config/env.ts) — invalid config calls `process.exit(1)`. Add new config there, never read `process.env` directly elsewhere. `.env` is auto-loaded from both the api package dir and the workspace root.
- **Central error handler** in `app.ts`: `ZodError` → 400 with `issues`, any 4xx `statusCode` passes through, everything else → 500 (generic message in production). Throw errors with a `statusCode` for client errors; don't hand-format 4xx responses in routes.
- **DB** is a single shared `postgres-js` pool + Drizzle instance ([apps/api/src/db/index.ts](apps/api/src/db/index.ts)), decorated onto the app as `app.db`. Use `app.db` in handlers.

### Web conventions

- API calls go through the shared axios instance [apps/web/src/lib/api.ts](apps/web/src/lib/api.ts) (`withCredentials: true` for future httpOnly auth cookies). Don't create ad-hoc axios/fetch calls.
- Providers wired in [apps/web/src/main.tsx](apps/web/src/main.tsx): React Query + `sonner` Toaster (dark). Use `cn()` from `src/lib/utils.ts` for class merging.

## Constraints

- TypeScript is strict, plus `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` ([tsconfig.base.json](tsconfig.base.json)). Use `import type` for type-only imports.
- `pnpm package:zip` (`scripts/package-deploy.mjs`) zips the repo for deploy — **includes `.env` files**, so keep the zip private.
