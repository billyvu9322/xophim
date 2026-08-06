# XoPhim

Movie streaming website — **codebase scaffold only** (no features yet).

pnpm monorepo: `apps/api` (Fastify + Drizzle + PostgreSQL) and `apps/web`
(Vite + React SPA). Structure and conventions mirror the FinFolio project.

## Stack

- **API** — Fastify 5, Drizzle ORM + `postgres-js`, Zod (`fastify-type-provider-zod`)
  for request/response I/O, runs via `tsx` (no compiled build — `noEmit` typecheck).
  ESM with explicit `.js` import extensions (NodeNext convention).
- **Web** — Vite 5, React 18, TanStack Router + Query, Zustand, Tailwind (dark-first),
  axios client. `@/*` path alias → `src/*`.
- **Tooling** — turbo orchestrates `dev` / `build` / `typecheck`.

## Prerequisites

- Node ≥ 20, pnpm 9
- A PostgreSQL database (local or remote)

## Setup

```bash
pnpm install

# Shared API + web env
cp .env.example .env
# → set DATABASE_URL
```

## Commands (from repo root)

```bash
pnpm dev            # api (:5243) + web (:5173) in parallel
pnpm build          # build all
pnpm typecheck      # tsc across workspaces

# DB (Drizzle) — no tables yet
pnpm db:generate    # generate SQL migrations from schema
pnpm db:migrate     # apply migrations
pnpm db:push        # push schema directly (dev)
```

Per-app:

```bash
pnpm --filter @xophim/api dev
pnpm --filter @xophim/web dev
```

## Deployment (single image)

The root [Dockerfile](Dockerfile) builds **one image**: Vite builds the SPA, then the
Fastify API serves the built SPA from `WEB_STATIC_DIR` (via `@fastify/static`, SPA
fallback in `app.ts`). No nginx, no separate web container. The API runs via `tsx`
(no compiled API dist).

```bash
docker compose up --build     # single `app` service on API_PORT (default 5243)
```

`docker-compose.yml` runs only the `app` service. **PostgreSQL is external** — set
`DATABASE_URL` (host DB reachable via `host.docker.internal`).

```bash
pnpm package:zip              # zip the repo for deploy (excludes node_modules/dist/.git)
                              # WARNING: includes .env files — keep the zip private
```

## Current state

- API: `GET /v1/health` (pings DB). Central Zod error handler. Optional static-SPA
  serving when `WEB_STATIC_DIR` is set (single-image deploy).
- Web: placeholder landing page. Tailwind + Query provider + Toaster wired.
- DB: empty Drizzle schema (`apps/api/src/db/schema/index.ts`) and empty `drizzle/`.

## Not yet implemented (awaiting feature plan)

Auth, movie catalog/schema, search, video player/streaming, admin.

## Layout

```
apps/
  api/
    src/
      server.ts          # boot
      app.ts             # buildApp(): plugins, error handler, /v1, static SPA
      config/env.ts      # Zod-validated env (exit(1) on invalid)
      db/index.ts        # postgres-js pool + Drizzle instance
      db/schema/index.ts  # schema re-export (empty)
      routes.ts          # /health
      plugins/           # (empty — auth/swagger later)
    drizzle/             # migrations (empty)
  web/
    src/
      main.tsx  App.tsx  # entry + placeholder page
      lib/api.ts         # axios instance
      lib/utils.ts       # cn()
```

```bash
rm -rf xophim
unzip xophim.zip -d xophim && cd xophim
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production run --rm app pnpm --filter @xophim/api db:migrate
docker compose logs -f app
