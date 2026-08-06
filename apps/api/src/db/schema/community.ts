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

// comments — one-level replies (parent_id), soft delete (deleted_at).
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    movieSlug: text("movie_slug").notNull(),
    parentId: uuid("parent_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("comments_movie_slug_created_at_idx").on(t.movieSlug, t.createdAt)],
);

export const commentLikes = pgTable(
  "comment_likes",
  {
    commentId: uuid("comment_id").notNull(),
    userId: uuid("user_id").notNull(),
  },
  (t) => [unique("comment_likes_unique").on(t.commentId, t.userId)],
);

// ratings — XoPhim user score (separate from KKPhim IMDb/TMDb).
export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    movieSlug: text("movie_slug").notNull(),
    score: smallint("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("ratings_user_movie_unique").on(t.userId, t.movieSlug)],
);

// reports — Báo lỗi phim. Guests may report (user_id nullable).
export const reportReasonEnum = pgEnum("report_reason", [
  "khong-phat",
  "sai-phim",
  "loi-phu-de",
  "giat-lag",
]);
export const reportStatusEnum = pgEnum("report_status", ["open", "resolved"]);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  movieSlug: text("movie_slug").notNull(),
  episodeSlug: text("episode_slug"),
  reason: reportReasonEnum("reason").notNull(),
  note: text("note"),
  status: reportStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
