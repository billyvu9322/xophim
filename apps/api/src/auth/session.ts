import { and, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Database } from "../db/index.js";
import { sessions, users } from "../db/schema/index.js";
import type { AuthUser } from "./types.js";

interface CreateSessionOpts {
  userId: string;
  ttlDays: number;
  userAgent?: string;
  ip?: string;
}

// Generates a cryptographically random 32-byte hex session id, inserts it, and
// returns the id so the caller can set it as the `sid` cookie.
export async function createSession(
  db: Database,
  opts: CreateSessionOpts,
): Promise<string> {
  const sid = randomBytes(32).toString("hex"); // 64 hex chars
  const expiresAt = new Date(Date.now() + opts.ttlDays * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    id: sid,
    userId: opts.userId,
    expiresAt,
    userAgent: opts.userAgent,
    ip: opts.ip,
  });
  return sid;
}

// Looks up the session and returns the joined user, or null if missing/expired.
export async function lookupSession(
  db: Database,
  sid: string,
): Promise<AuthUser | null> {
  const now = new Date();
  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      username: users.username,
      email: users.email,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, now)))
    .limit(1);
  return rows[0] ?? null;
}

// Deletes the session row (used by logout).
export async function deleteSession(db: Database, sid: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sid));
}
