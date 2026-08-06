import type { Database } from "../db/index.js";
import { lookupSession } from "./session.js";
import type { AuthUser } from "./types.js";

/**
 * Soft companion to requireAuth: reads the session for public-but-enrich
 * endpoints (GET comments, GET rating, POST reports) and returns the user, or
 * null when the cookie is absent / the session is missing or expired. Never
 * throws 401 — unauthenticated callers get a normal 200.
 *
 * Reuses P2's lookupSession (join sessions → users), so it needs no relational
 * config.
 */
export async function readOptionalUser(
  db: Database,
  sid: string | undefined,
): Promise<AuthUser | null> {
  if (!sid) return null;
  return lookupSession(db, sid);
}
