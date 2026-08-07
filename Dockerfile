# XoPhim — single image: builds the web SPA and runs the Fastify API (via tsx),
# which also serves the built SPA (WEB_STATIC_DIR). No turbo, no shared packages.
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
# Workspace manifests first for cached installs.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
# Build the web SPA (Vite). VITE_* are baked at build time. We pass them as
# build args (NOT via .env.production, which is dockerignored because it holds
# GOOGLE_CLIENT_SECRET — secrets must never be baked into the image). The Google
# client id is public, so it's safe to default here; override with --build-arg.
ARG VITE_API_BASE_URL=
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
COPY . .
RUN pnpm --filter @xophim/web build

# Runtime reuses the build stage (the API runs via tsx, so it needs the full
# workspace deps + source — there is no compiled API dist).
FROM build AS runtime
ENV NODE_ENV=production
# The API serves the built SPA from here (see app.ts).
ENV WEB_STATIC_DIR=/app/apps/web/dist
EXPOSE 5243
CMD ["pnpm", "--filter", "@xophim/api", "start"]
