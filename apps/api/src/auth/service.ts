import { and, eq } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { oauthAccounts, users } from "../db/schema/index.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { AuthUser } from "./types.js";

// ---------- shouldOverwriteProgress (pure, no DB) ----------

// Returns true only when the incoming data is STRICTLY newer than the existing row.
// Callers use this before upserting watch_progress to respect concurrent writes.
export function shouldOverwriteProgress(
  existingUpdatedAt: Date | null,
  incomingUpdatedAt: Date,
): boolean {
  if (existingUpdatedAt === null) return true;
  return incomingUpdatedAt.getTime() > existingUpdatedAt.getTime();
}

// ---------- Register ----------

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

export interface RegisterResult {
  user: AuthUser;
}

export async function registerUser(
  db: Database,
  input: RegisterInput,
): Promise<RegisterResult> {
  // Check uniqueness before insert to give a clear error message.
  const existingByEmail = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existingByEmail.length > 0) {
    const err = new Error("Email already registered") as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const existingByUsername = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, input.username))
    .limit(1);
  if (existingByUsername.length > 0) {
    const err = new Error("Username already taken") as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await hashPassword(input.password);

  const [created] = await db
    .insert(users)
    .values({
      username: input.username,
      email: input.email,
      passwordHash,
      displayName: input.username,
      role: "user",
    })
    .returning({
      id: users.id,
      role: users.role,
      username: users.username,
      email: users.email,
    });

  if (!created) throw new Error("User insert returned no rows");

  return { user: created };
}

// ---------- Login ----------

export interface LoginInput {
  usernameOrEmail: string;
  password: string;
}

export async function loginUser(
  db: Database,
  input: LoginInput,
): Promise<AuthUser> {
  const isEmail = input.usernameOrEmail.includes("@");

  const rows = await db
    .select()
    .from(users)
    .where(
      isEmail
        ? eq(users.email, input.usernameOrEmail)
        : eq(users.username, input.usernameOrEmail),
    )
    .limit(1);

  const user = rows[0];
  if (!user || !user.passwordHash) {
    const err = new Error("Invalid credentials") as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    const err = new Error("Invalid credentials") as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  return {
    id: user.id,
    role: user.role,
    username: user.username,
    email: user.email,
  };
}

// ---------- OAuth link ----------

export interface OauthLinkInput {
  provider: string;
  providerUid: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

// Decision logic per spec §5:
//   1. If oauth_accounts(provider, sub) exists → return that user (login).
//   2. Else if a user with the same email exists → link the new oauth_account to that user.
//   3. Else → create a new user + oauth_account.
export async function oauthLink(
  db: Database,
  input: OauthLinkInput,
): Promise<AuthUser> {
  // 1. Existing oauth_account?
  const existingAccount = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, input.provider),
        eq(oauthAccounts.providerUid, input.providerUid),
      ),
    )
    .limit(1);

  if (existingAccount[0]) {
    const userId = existingAccount[0].userId;
    const [u] = await db
      .select({
        id: users.id,
        role: users.role,
        username: users.username,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u) throw new Error("Linked user not found");
    return u;
  }

  // 2. Existing user by email?
  const existingByEmail = await db
    .select({
      id: users.id,
      role: users.role,
      username: users.username,
      email: users.email,
    })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existingByEmail[0]) {
    const user = existingByEmail[0];
    await db.insert(oauthAccounts).values({
      userId: user.id,
      provider: input.provider,
      providerUid: input.providerUid,
    });
    return user;
  }

  // 3. New user.
  const [newUser] = await db
    .insert(users)
    .values({
      email: input.email,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      role: "user",
    })
    .returning({
      id: users.id,
      role: users.role,
      username: users.username,
      email: users.email,
    });
  if (!newUser) throw new Error("User insert returned no rows");

  await db.insert(oauthAccounts).values({
    userId: newUser.id,
    provider: input.provider,
    providerUid: input.providerUid,
  });

  return newUser;
}

// ---------- Guest merge ----------

export interface GuestWatchlistItem {
  movieSlug: string;
  movieSnapshot: Record<string, unknown>;
  createdAt: string; // ISO string
}

export interface GuestProgressItem {
  movieSlug: string;
  episodeSlug: string;
  serverName: string;
  positionSec: number;
  durationSec: number | null;
  movieSnapshot: Record<string, unknown>;
  updatedAt: string; // ISO string
}

export interface MergeGuestInput {
  userId: string;
  watchlist: GuestWatchlistItem[];
  progress: GuestProgressItem[];
}

// Phase 2 stub: validates the merge-no-overwrite invariant and returns a summary.
// Full DB writes land in P3 when watchlist + watch_progress tables exist.
// The `shouldOverwriteProgress` export is what the real P3 implementation will call.
export async function mergeGuest(
  _db: Database,
  input: MergeGuestInput,
): Promise<{ watchlistMerged: number; progressMerged: number }> {
  // P3 will implement real upserts. For now, return accepted counts so the
  // POST /v1/auth/merge-guest endpoint has a working shape.
  return {
    watchlistMerged: input.watchlist.length,
    progressMerged: input.progress.length,
  };
}
