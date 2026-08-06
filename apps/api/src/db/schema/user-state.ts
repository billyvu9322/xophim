import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Shared snapshot stored in jsonb so list views (watchlist, history rails)
// render without re-fetching KKPhim per item. Accept mild staleness; refresh
// on detail open.
export interface MovieSnapshot {
  name: string;
  posterUrl: string;
  type: string;
  year: number | null;
}

export const watchlist = pgTable(
  "watchlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    movie_slug: text("movie_slug").notNull(),
    movie_snapshot: jsonb("movie_snapshot").$type<MovieSnapshot>().notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq_user_movie: unique("watchlist_user_id_movie_slug_key").on(t.user_id, t.movie_slug),
    idx_user: index("watchlist_user_id_idx").on(t.user_id),
  }),
);

// watch_progress — Xem Tiếp / History. episode_slug is 'full' for phim lẻ.
export const watchProgress = pgTable(
  "watch_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    movie_slug: text("movie_slug").notNull(),
    episode_slug: text("episode_slug").notNull(),
    server_name: text("server_name").notNull().default(""),
    position_sec: integer("position_sec").notNull().default(0),
    duration_sec: integer("duration_sec"),
    movie_snapshot: jsonb("movie_snapshot").$type<MovieSnapshot>().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq_user_movie_ep: unique("watch_progress_user_movie_ep_key").on(
      t.user_id,
      t.movie_slug,
      t.episode_slug,
    ),
    idx_user_updated: index("watch_progress_user_updated_idx").on(t.user_id, t.updated_at),
  }),
);
