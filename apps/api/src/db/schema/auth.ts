import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name").notNull().default(""),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One user may link many OAuth providers (Google, etc.).
// Unique on (provider, provider_uid) so a Google account maps to exactly one user.
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // 'google'
    providerUid: text("provider_uid").notNull(), // Google sub
  },
  (t) => ({
    providerUnique: unique().on(t.provider, t.providerUid),
  }),
);

// Opaque session — the cookie value IS the session id (32-byte hex).
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // 32-byte hex, NOT a uuid
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  userAgent: text("user_agent"),
  ip: text("ip"),
});
