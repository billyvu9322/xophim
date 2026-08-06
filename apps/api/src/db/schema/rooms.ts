import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Persisted room metadata only. Playback state, chat, and member list live in
// the RoomManager singleton for the room's lifetime (design spec §7 — chat
// history persistence deferred at MVP).
export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Short shareable invite code (e.g. "AB12CD"). Unique so codes don't collide.
  code: text("code").unique().notNull(),
  hostUserId: uuid("host_user_id").notNull(),
  // KKPhim natural keys — no FK to a catalog table (catalog is never persisted).
  movieSlug: text("movie_slug").notNull(),
  episodeSlug: text("episode_slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Null = still open. Set on explicit close.
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
