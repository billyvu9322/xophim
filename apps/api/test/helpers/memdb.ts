import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../../src/db/schema/index.js";

// Build an in-memory Postgres (PGlite = real Postgres compiled to WASM) with the
// auth DDL applied, wrapped in a Drizzle instance. PGlite is PG15, so
// gen_random_uuid() and full SQL semantics work — unlike a pg emulator.
// The auth helpers are typed against the postgres-js Database but only use
// portable query builders, so the pglite-backed Drizzle instance works at runtime.
export async function buildMemDb() {
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      display_name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE oauth_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_uid TEXT NOT NULL,
      UNIQUE(provider, provider_uid)
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_agent TEXT,
      ip TEXT
    );
    CREATE TABLE watchlist (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      movie_slug TEXT NOT NULL,
      movie_snapshot JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, movie_slug)
    );
    CREATE TABLE watch_progress (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      movie_slug TEXT NOT NULL,
      episode_slug TEXT NOT NULL,
      server_name TEXT NOT NULL DEFAULT '',
      position_sec INTEGER NOT NULL DEFAULT 0,
      duration_sec INTEGER,
      movie_snapshot JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, movie_slug, episode_slug)
    );
    CREATE TABLE comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      movie_slug TEXT NOT NULL,
      parent_id UUID,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      edited_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ
    );
    CREATE TABLE comment_likes (
      comment_id UUID NOT NULL,
      user_id UUID NOT NULL,
      UNIQUE(comment_id, user_id)
    );
    CREATE TABLE ratings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      movie_slug TEXT NOT NULL,
      score SMALLINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, movie_slug)
    );
    CREATE TABLE reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      movie_slug TEXT NOT NULL,
      episode_slug TEXT,
      reason TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE collections (
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
    CREATE TABLE collection_items (
      collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      movie_slug TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      movie_snapshot JSONB NOT NULL DEFAULT '{}',
      UNIQUE(collection_id, movie_slug)
    );
    CREATE TABLE rooms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL UNIQUE,
      host_user_id UUID NOT NULL,
      movie_slug TEXT NOT NULL,
      episode_slug TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    );
  `);
  return drizzle(client, { schema });
}
