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

// Editor-curated lists of movies. Only is_published=true rows are public.
// movie_snapshot on each item lets list/detail render without KKPhim N+1.
export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  cover_url: text("cover_url").notNull().default(""),
  is_published: boolean("is_published").notNull().default(false),
  sort: integer("sort").notNull().default(0),
  created_by: uuid("created_by").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const collectionItems = pgTable(
  "collection_items",
  {
    collection_id: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    movie_slug: text("movie_slug").notNull(),
    sort: integer("sort").notNull().default(0),
    // {name, posterUrl, thumbUrl, type, year, quality}
    movie_snapshot: jsonb("movie_snapshot").notNull().default({}),
  },
  (t) => [unique("collection_items_unique").on(t.collection_id, t.movie_slug)],
);
