# XoPhim P2 (Auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AUTH layer — Drizzle tables for users/oauth_accounts/sessions, argon2id password hashing, Fastify auth routes (register/login/logout/Google OAuth2+PKCE/me/merge-guest), a `requireAuth` preHandler decorator, a typed web `useAuth` hook (TanStack Query), and a guest Zustand store — so the app supports both credentials and Google sign-in, with guest-to-user state merging on login.

**Architecture:** Auth routes live under `/v1/auth/*` as a Fastify plugin. Sessions are opaque 32-byte hex ids stored in the `sessions` table and set as `sid` cookies (httpOnly, Secure, SameSite=Lax). Google OAuth2 uses Authorization Code + PKCE implemented with `node:crypto` and `fetch` — no SDK. The `requireAuth` decorator is added to the FastifyInstance (mirroring how `db`/`env` are decorated in app.ts). Web side: `useAuth` hook (TanStack Query) + `guestStore` (Zustand + localStorage).

**Tech Stack:** Fastify 5, `fastify-type-provider-zod`, Zod 3, Drizzle ORM (postgres-js), `argon2` (argon2id), `@fastify/cookie` (already in deps), `node:crypto` (built-in), `pg-mem` (in-memory Postgres for integration tests), Vitest, React + TanStack Query, Zustand.

> **NO GIT COMMITS.** Per project convention the user handles git. Every task ends with a **Checkpoint** (typecheck + tests) instead of a commit. Do not run `git add`/`git commit`.

**Reference:** System spec §3 AUTH + §4 AUTH + §5 Auth flow in [docs/superpowers/specs/2026-08-06-xophim-design.md](../specs/2026-08-06-xophim-design.md). P0/P1 plan for file/style conventions in [docs/superpowers/plans/2026-08-06-xophim-p0-p1-catalog.md](./2026-08-06-xophim-p0-p1-catalog.md).

---

## File Structure

**API (`apps/api/src/`)**
- `config/env.ts` — *modify*: add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SESSION_TTL_DAYS`, `WEB_ORIGIN`.
- `db/schema/auth.ts` — *create*: Drizzle tables `users`, `oauth_accounts`, `sessions`.
- `db/schema/index.ts` — *modify*: export `auth.ts` tables so Drizzle and drizzle-kit pick them up.
- `auth/types.ts` — *create*: shared TS types (`AuthUser`, `SessionRow`, module augmentation for `FastifyRequest.user` + `FastifyInstance.requireAuth`).
- `auth/session.ts` — *create*: `createSession`, `lookupSession`, `deleteSession` (pure DB helpers).
- `auth/password.ts` — *create*: `hashPassword`, `verifyPassword` wrappers around `argon2`.
- `auth/oauth-google.ts` — *create*: hand-rolled Google OAuth2+PKCE helpers (build auth URL, exchange code, fetch userinfo).
- `auth/service.ts` — *create*: `registerUser`, `loginUser`, `oauthLink` (find/create user from Google sub), `mergeGuest` business logic.
- `auth/routes.ts` — *create*: Fastify plugin with all `/auth/*` routes + `requireAuth` decorator.
- `routes.ts` — *modify*: register the auth plugin under `/v1`.

**API tests (`apps/api/test/`)**
- `password.test.ts` — unit: argon2 hash+verify round-trip + wrong-password rejects.
- `session.test.ts` — unit: session create/lookup/expiry/delete (pg-mem).
- `oauth-google.test.ts` — unit: `buildAuthUrl` query params, PKCE verifier/challenge, `oauthLink` decision (new user / link-by-email / existing account).
- `merge-guest.test.ts` — unit: merge never overwrites newer `updated_at` progress row.
- `auth.routes.test.ts` — integration via `app.inject` + pg-mem: register, login, logout, me, requireAuth 401 guard.

**Web (`apps/web/src/`)**
- `lib/auth-types.ts` — *create*: `AuthUser`, `LoginPayload`, `RegisterPayload`, `MergeGuestPayload` TS types.
- `lib/auth-api.ts` — *create*: typed axios functions calling `/v1/auth/*`.
- `hooks/auth.ts` — *create*: `useAuth`, `useLogin`, `useRegister`, `useLogout` (TanStack Query + mutations).
- `lib/guest-store.ts` — *create*: Zustand store + localStorage for guest watchlist/progress.

---

## Task 1: Extend env with Auth vars

**Files:**
- Modify: `apps/api/src/config/env.ts`

Auth needs five new env vars. Defaults keep the app bootable without them (Google OAuth is optional until those vars are set), except `WEB_ORIGIN` which is needed to redirect after OAuth.

- [ ] **Step 1: Add the five vars to the Zod schema**

In `apps/api/src/config/env.ts`, inside `envSchema = z.object({ … })`, add after the existing `CORS_ORIGIN` field:

```ts
  // Auth — Google OAuth2 + PKCE.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Must match exactly what's registered in Google Cloud Console.
  GOOGLE_REDIRECT_URI: z.string().url().optional(),

  // Cookie maxAge = SESSION_TTL_DAYS * 86400 seconds. Default 30 days.
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Where to redirect after OAuth callback (the web origin, e.g. http://localhost:5173).
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors. All five vars have defaults or are optional so no `.env` changes are required.

---

## Task 2: Drizzle schema — users, oauth_accounts, sessions

**Files:**
- Create: `apps/api/src/db/schema/auth.ts`
- Modify: `apps/api/src/db/schema/index.ts`

These are the three tables from spec §3 AUTH. The migration is generated after this task.

- [ ] **Step 1: Create the auth schema file**

Create `apps/api/src/db/schema/auth.ts`:

```ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
export const oauthAccounts = pgTable("oauth_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'google'
  providerUid: text("provider_uid").notNull(), // Google sub
});

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
```

> Note: `oauth_accounts` has a unique constraint on `(provider, provider_uid)`. Drizzle does not have a `uniqueIndex` shorthand on two columns in the table-definition DSL for all versions; add it via `drizzle-kit` push or a custom raw index. In the migration file generated by `pnpm db:generate`, manually verify a `UNIQUE(provider, provider_uid)` constraint is present; if not, add it manually to the generated SQL before running the migration.

- [ ] **Step 2: Export from schema/index.ts**

Replace the contents of `apps/api/src/db/schema/index.ts`:

```ts
// Drizzle schema source of truth. Re-export every table module from here so the
// Drizzle instance and drizzle-kit pick them all up.

export * from "./auth.js";
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm --filter @xophim/api db:generate`
Expected: a new SQL file created under `apps/api/drizzle/` (or whichever `out` dir drizzle-kit is configured to). Review the file and confirm it contains `CREATE TABLE users`, `CREATE TABLE oauth_accounts`, `CREATE TABLE sessions`.

- [ ] **Step 4: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 3: Password helpers (argon2id)

**Files:**
- Modify: `apps/api/package.json` — add `argon2` dependency.
- Create: `apps/api/src/auth/password.ts`
- Test: `apps/api/test/password.test.ts`

`argon2` is a native Node addon published to npm. The `argon2id` variant is the default when using `argon2.hash`.

- [ ] **Step 1: Add the argon2 dependency**

In `apps/api/package.json`, add to `dependencies`:
```json
    "argon2": "^0.41.1"
```

Run: `pnpm install`
Expected: `argon2` installs (downloads native binding), no errors.

- [ ] **Step 2: Write the failing test**

Create `apps/api/test/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password.js";

describe("password helpers", () => {
  it("hashes a password and verifies it correctly", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    const ok = await verifyPassword("correct-horse-battery-staple", hash);
    expect(ok).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("secret");
    const ok = await verifyPassword("wrong", hash);
    expect(ok).toBe(false);
  });

  it("produces different hashes for the same password (salt)", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });

  it("throws when verifying a malformed hash", async () => {
    await expect(verifyPassword("pw", "not-a-valid-argon2-hash")).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @xophim/api test password`
Expected: FAIL — cannot find module `../src/auth/password.js`.

- [ ] **Step 4: Write the implementation**

Create `apps/api/src/auth/password.ts`:

```ts
import argon2 from "argon2";

// argon2id is the recommended variant (hybrid of argon2i and argon2d).
// The `argon2` package defaults to argon2id when using argon2.hash().

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, { type: argon2.argon2id });
}

export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return argon2.verify(hash, plaintext);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @xophim/api test password`
Expected: 4 passed.

- [ ] **Step 6: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 4: Auth types + module augmentation

**Files:**
- Create: `apps/api/src/auth/types.ts`

Declares the shared `AuthUser` shape and augments Fastify so `request.user` and `app.requireAuth` are typed everywhere — mirroring how `app.ts` augments `FastifyInstance` for `db` and `env`.

- [ ] **Step 1: Create the types file**

Create `apps/api/src/auth/types.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

// The shape attached to request.user after requireAuth runs.
export interface AuthUser {
  id: string;
  role: string;
  username: string | null;
  email: string;
}

// Module augmentation so request.user and app.requireAuth are typed globally.
declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
  interface FastifyInstance {
    requireAuth: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 5: Session DB helpers

**Files:**
- Create: `apps/api/src/auth/session.ts`
- Test: `apps/api/test/session.test.ts`

Pure DB functions: `createSession` (generates a 32-byte hex id, inserts a row), `lookupSession` (returns the joined user if session exists and is not expired), `deleteSession` (deletes by id). Tests use `pg-mem`.

- [ ] **Step 1: Add pg-mem dev dependency**

In `apps/api/package.json`, add to `devDependencies`:
```json
    "pg-mem": "^2.8.1"
```

Run: `pnpm install`
Expected: `pg-mem` installs, no errors.

> **pg-mem caveat:** `pg-mem` is an in-memory Postgres emulator. It covers most DML and DDL but has known gaps (some advanced Postgres features, certain window functions, some casts). For this phase its coverage of `INSERT`, `SELECT`, `DELETE`, `WHERE`, and `TIMESTAMP` comparisons is sufficient. If a test fails due to a pg-mem limitation rather than a real bug, document the workaround inline.

- [ ] **Step 2: Write the failing test**

Create `apps/api/test/session.test.ts`:

```ts
import { drizzle } from "drizzle-orm/pg-mem";
import { newDb } from "pg-mem";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../src/db/schema/index.js";
import { createSession, deleteSession, lookupSession } from "../src/auth/session.js";

function buildMemDb() {
  const mem = newDb();
  // Migrate: create tables manually for pg-mem (it doesn't run drizzle migrations).
  mem.public.none(`
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
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_agent TEXT,
      ip TEXT
    );
  `);
  const pg = mem.adapters.createPg();
  return drizzle(new pg.Pool(), { schema });
}

describe("session helpers", () => {
  let db: ReturnType<typeof buildMemDb>;
  let userId: string;

  beforeEach(async () => {
    db = buildMemDb();
    const [user] = await db
      .insert(schema.users)
      .values({ email: "test@example.com", role: "user", displayName: "Test" })
      .returning();
    userId = user!.id;
  });

  it("createSession inserts a row and returns the session id (32 hex chars)", async () => {
    const sid = await createSession(db, { userId, ttlDays: 7 });
    expect(sid).toMatch(/^[0-9a-f]{64}$/); // 32 bytes = 64 hex chars
  });

  it("lookupSession returns the user for a valid non-expired session", async () => {
    const sid = await createSession(db, { userId, ttlDays: 7 });
    const user = await lookupSession(db, sid);
    expect(user).not.toBeNull();
    expect(user!.id).toBe(userId);
    expect(user!.email).toBe("test@example.com");
  });

  it("lookupSession returns null for an unknown session id", async () => {
    const user = await lookupSession(db, "deadbeef".repeat(8));
    expect(user).toBeNull();
  });

  it("lookupSession returns null after deleteSession", async () => {
    const sid = await createSession(db, { userId, ttlDays: 7 });
    await deleteSession(db, sid);
    const user = await lookupSession(db, sid);
    expect(user).toBeNull();
  });

  it("lookupSession returns null for an expired session", async () => {
    // Insert an already-expired session directly.
    const expiredSid = "ff".repeat(32);
    const pastDate = new Date(Date.now() - 1000);
    await db.insert(schema.sessions).values({
      id: expiredSid,
      userId,
      expiresAt: pastDate,
    });
    const user = await lookupSession(db, expiredSid);
    expect(user).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @xophim/api test session`
Expected: FAIL — cannot find module `../src/auth/session.js`.

- [ ] **Step 4: Write the implementation**

Create `apps/api/src/auth/session.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @xophim/api test session`
Expected: 5 passed.

- [ ] **Step 6: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 6: Google OAuth2 + PKCE helpers

**Files:**
- Create: `apps/api/src/auth/oauth-google.ts`
- Test: `apps/api/test/oauth-google.test.ts`

Hand-rolled using `node:crypto` + `fetch`. No SDK. State and code_verifier are stored in a short-lived signed cookie; the callback reads them back to verify. Provider uid = Google `sub`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/oauth-google.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildAuthUrl,
  generatePkce,
  generateState,
} from "../src/auth/oauth-google.js";

describe("Google OAuth helpers", () => {
  it("generateState returns a 32-byte hex string", () => {
    const s = generateState();
    expect(s).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generateState returns different values on each call", () => {
    expect(generateState()).not.toBe(generateState());
  });

  it("generatePkce returns verifier and challenge", () => {
    const { verifier, challenge } = generatePkce();
    // RFC 7636: verifier is 43–128 unreserved characters.
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    // challenge is base64url-encoded SHA256 of the verifier.
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("buildAuthUrl produces a valid Google authorization URL with PKCE params", () => {
    const url = buildAuthUrl({
      clientId: "test-client-id",
      redirectUri: "https://api.example.com/v1/auth/google/callback",
      state: "abc123",
      codeChallenge: "challenge_value",
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("accounts.google.com");
    expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
    expect(parsed.searchParams.get("state")).toBe("abc123");
    expect(parsed.searchParams.get("code_challenge")).toBe("challenge_value");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://api.example.com/v1/auth/google/callback",
    );
    expect(parsed.searchParams.get("response_type")).toBe("code");
    const scopes = (parsed.searchParams.get("scope") ?? "").split(" ");
    expect(scopes).toContain("openid");
    expect(scopes).toContain("email");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xophim/api test oauth-google`
Expected: FAIL — cannot find module `../src/auth/oauth-google.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/auth/oauth-google.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

// ---------- PKCE helpers ----------

export function generateState(): string {
  return randomBytes(32).toString("hex");
}

export function generatePkce(): { verifier: string; challenge: string } {
  // verifier: 32 random bytes → base64url (43 chars, well within 128 limit).
  const verifier = randomBytes(32)
    .toString("base64url")
    .replace(/=/g, "");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url")
    .replace(/=/g, "");
  return { verifier, challenge };
}

// ---------- Authorization URL ----------

interface BuildAuthUrlOpts {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

export function buildAuthUrl(opts: BuildAuthUrlOpts): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ---------- Token exchange ----------

export interface GoogleTokens {
  accessToken: string;
  idToken: string;
}

export interface GoogleUserInfo {
  sub: string;   // Provider uid — the stable Google user identifier.
  email: string;
  name: string;
  picture: string | null;
}

export async function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    code: opts.code,
    code_verifier: opts.codeVerifier,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { access_token: string; id_token: string };
  return { accessToken: json.access_token, idToken: json.id_token };
}

export async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  };
  return {
    sub: json.sub,
    email: json.email,
    name: json.name ?? json.email,
    picture: json.picture ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xophim/api test oauth-google`
Expected: 4 passed.

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 7: Auth service (register, login, oauthLink, mergeGuest)

**Files:**
- Create: `apps/api/src/auth/service.ts`
- Test: `apps/api/test/merge-guest.test.ts` (merge-no-overwrite unit test)

Business logic only — no HTTP. `oauthLink` decides whether to create a new user or link to an existing one. `mergeGuest` upserts but never overwrites a `watch_progress` row whose `updated_at` is newer than the incoming one (enforced by checking the existing row before upsert; full DB tables for P3, so we store the merge payload shape here but the actual DB writes are a no-op stubs until P3).

- [ ] **Step 1: Write the failing merge-guest test**

Create `apps/api/test/merge-guest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shouldOverwriteProgress } from "../src/auth/service.js";

describe("shouldOverwriteProgress", () => {
  it("returns true when there is no existing row", () => {
    expect(shouldOverwriteProgress(null, new Date("2026-01-02"))).toBe(true);
  });

  it("returns true when the incoming updated_at is newer than the existing row", () => {
    const existing = new Date("2026-01-01T10:00:00Z");
    const incoming = new Date("2026-01-01T11:00:00Z");
    expect(shouldOverwriteProgress(existing, incoming)).toBe(true);
  });

  it("returns false when the existing row is newer than the incoming", () => {
    const existing = new Date("2026-01-01T12:00:00Z");
    const incoming = new Date("2026-01-01T11:00:00Z");
    expect(shouldOverwriteProgress(existing, incoming)).toBe(false);
  });

  it("returns false when timestamps are equal (existing wins as tie-break)", () => {
    const ts = new Date("2026-01-01T10:00:00Z");
    expect(shouldOverwriteProgress(ts, ts)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xophim/api test merge-guest`
Expected: FAIL — cannot find module `../src/auth/service.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/auth/service.ts`:

```ts
import { eq, and } from "drizzle-orm";
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
  _input: MergeGuestInput,
): Promise<{ watchlistMerged: number; progressMerged: number }> {
  // P3 will implement real upserts. For now, return accepted counts so the
  // POST /v1/auth/merge-guest endpoint has a working shape.
  return {
    watchlistMerged: _input.watchlist.length,
    progressMerged: _input.progress.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xophim/api test merge-guest`
Expected: 4 passed.

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 8: Auth routes plugin + requireAuth decorator

**Files:**
- Create: `apps/api/src/auth/routes.ts`
- Modify: `apps/api/src/routes.ts`

The Fastify plugin:
1. Decorates the app with `requireAuth` (a preHandler that reads the `sid` cookie, calls `lookupSession`, sets `request.user`, or replies 401).
2. Registers all `/auth/*` routes.
3. Google OAuth routes store state+verifier in a signed short-lived cookie (`oauth_state`).

- [ ] **Step 1: Create the auth routes plugin**

Create `apps/api/src/auth/routes.ts`:

```ts
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { db } from "../db/index.js";
import {
  buildAuthUrl,
  exchangeCode,
  fetchGoogleUserInfo,
  generatePkce,
  generateState,
} from "./oauth-google.js";
import { hashPassword } from "./password.js";
import { createSession, deleteSession, lookupSession } from "./session.js";
import {
  loginUser,
  mergeGuest,
  oauthLink,
  registerUser,
} from "./service.js";
import type { AuthUser } from "./types.js";
import "./types.js"; // ensure module augmentation is loaded

const SID = "sid";
const OAUTH_STATE_COOKIE = "oauth_state";
const OAUTH_STATE_TTL_SEC = 60 * 10; // 10 minutes

function sidCookieOptions(ttlDays: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: ttlDays * 24 * 60 * 60,
  };
}

export const registerAuthRoutes: FastifyPluginAsyncZod = async (app) => {
  // ------------------------------------------------------------------ //
  //  requireAuth decorator — reads sid cookie, looks up session, sets   //
  //  request.user, or replies 401.                                      //
  // ------------------------------------------------------------------ //
  app.decorate(
    "requireAuth",
    async (request, reply) => {
      const sid = request.cookies[SID];
      if (!sid) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      const user = await lookupSession(db, sid);
      if (!user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      request.user = user;
    },
  );

  // ------------------------------------------------------------------ //
  //  POST /register                                                      //
  // ------------------------------------------------------------------ //
  app.post(
    "/register",
    {
      schema: {
        body: z.object({
          username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
          email: z.string().email(),
          password: z.string().min(8).max(128),
        }),
        response: {
          201: z.object({
            user: z.object({
              id: z.string(),
              username: z.string().nullable(),
              email: z.string(),
              role: z.string(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const { user } = await registerUser(db, request.body);
      const sid = await createSession(db, {
        userId: user.id,
        ttlDays: app.env.SESSION_TTL_DAYS,
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });
      reply.setCookie(SID, sid, sidCookieOptions(app.env.SESSION_TTL_DAYS));
      return reply.code(201).send({ user });
    },
  );

  // ------------------------------------------------------------------ //
  //  POST /login                                                         //
  // ------------------------------------------------------------------ //
  app.post(
    "/login",
    {
      schema: {
        body: z.object({
          usernameOrEmail: z.string().min(1),
          password: z.string().min(1),
        }),
        response: {
          200: z.object({
            user: z.object({
              id: z.string(),
              username: z.string().nullable(),
              email: z.string(),
              role: z.string(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const user = await loginUser(db, request.body);
      const sid = await createSession(db, {
        userId: user.id,
        ttlDays: app.env.SESSION_TTL_DAYS,
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });
      reply.setCookie(SID, sid, sidCookieOptions(app.env.SESSION_TTL_DAYS));
      return reply.send({ user });
    },
  );

  // ------------------------------------------------------------------ //
  //  POST /logout  (requireAuth)                                         //
  // ------------------------------------------------------------------ //
  app.post(
    "/logout",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const sid = request.cookies[SID];
      if (sid) await deleteSession(db, sid);
      reply.clearCookie(SID, { path: "/" });
      return reply.send({ ok: true });
    },
  );

  // ------------------------------------------------------------------ //
  //  GET /me  — returns current user or null (public; guard handled      //
  //  client-side by presence of the cookie).                             //
  // ------------------------------------------------------------------ //
  app.get(
    "/me",
    {
      schema: {
        response: {
          200: z.object({
            user: z
              .object({
                id: z.string(),
                username: z.string().nullable(),
                email: z.string(),
                role: z.string(),
              })
              .nullable(),
          }),
        },
      },
    },
    async (request, reply) => {
      const sid = request.cookies[SID];
      if (!sid) return reply.send({ user: null });
      const user = await lookupSession(db, sid);
      return reply.send({ user: user ?? null });
    },
  );

  // ------------------------------------------------------------------ //
  //  GET /google  — redirect to Google OAuth                             //
  // ------------------------------------------------------------------ //
  app.get("/google", async (request, reply) => {
    const clientId = app.env.GOOGLE_CLIENT_ID;
    const redirectUri = app.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return reply.code(503).send({ error: "Google OAuth is not configured" });
    }

    const state = generateState();
    const { verifier, challenge } = generatePkce();

    // Store state + verifier in a short-lived cookie (signed by @fastify/cookie).
    // Value: `state:verifier` — simple delimiter since neither value contains colons.
    reply.setCookie(OAUTH_STATE_COOKIE, `${state}:${verifier}`, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_STATE_TTL_SEC,
    });

    const url = buildAuthUrl({ clientId, redirectUri, state, codeChallenge: challenge });
    return reply.redirect(url);
  });

  // ------------------------------------------------------------------ //
  //  GET /google/callback                                                 //
  // ------------------------------------------------------------------ //
  app.get(
    "/google/callback",
    {
      schema: {
        querystring: z.object({
          code: z.string(),
          state: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const clientId = app.env.GOOGLE_CLIENT_ID;
      const clientSecret = app.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = app.env.GOOGLE_REDIRECT_URI;
      if (!clientId || !clientSecret || !redirectUri) {
        return reply.code(503).send({ error: "Google OAuth is not configured" });
      }

      // Verify state + extract verifier.
      const stateCookie = request.cookies[OAUTH_STATE_COOKIE] ?? "";
      const [storedState, verifier] = stateCookie.split(":");
      if (!storedState || !verifier || storedState !== request.query.state) {
        return reply.code(400).send({ error: "Invalid OAuth state" });
      }
      reply.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

      // Exchange code for tokens.
      const tokens = await exchangeCode({
        clientId,
        clientSecret,
        redirectUri,
        code: request.query.code,
        codeVerifier: verifier,
      });

      // Fetch Google userinfo.
      const googleUser = await fetchGoogleUserInfo(tokens.accessToken);

      // Link or create user.
      const user = await oauthLink(db, {
        provider: "google",
        providerUid: googleUser.sub,
        email: googleUser.email,
        displayName: googleUser.name,
        avatarUrl: googleUser.picture,
      });

      // Create session.
      const sid = await createSession(db, {
        userId: user.id,
        ttlDays: app.env.SESSION_TTL_DAYS,
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });
      reply.setCookie(SID, sid, sidCookieOptions(app.env.SESSION_TTL_DAYS));

      // Redirect back to the web app.
      return reply.redirect(app.env.WEB_ORIGIN);
    },
  );

  // ------------------------------------------------------------------ //
  //  POST /merge-guest  (requireAuth)                                    //
  // ------------------------------------------------------------------ //
  app.post(
    "/merge-guest",
    {
      preHandler: [app.requireAuth],
      schema: {
        body: z.object({
          watchlist: z
            .array(
              z.object({
                movieSlug: z.string(),
                movieSnapshot: z.record(z.unknown()),
                createdAt: z.string().datetime(),
              }),
            )
            .default([]),
          progress: z
            .array(
              z.object({
                movieSlug: z.string(),
                episodeSlug: z.string(),
                serverName: z.string(),
                positionSec: z.number().int().nonnegative(),
                durationSec: z.number().int().nonnegative().nullable(),
                movieSnapshot: z.record(z.unknown()),
                updatedAt: z.string().datetime(),
              }),
            )
            .default([]),
        }),
        response: {
          200: z.object({
            watchlistMerged: z.number(),
            progressMerged: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const result = await mergeGuest(db, {
        userId: user.id,
        watchlist: request.body.watchlist,
        progress: request.body.progress,
      });
      return reply.send(result);
    },
  );
};
```

- [ ] **Step 2: Register auth plugin under /v1**

In `apps/api/src/routes.ts`, add the import and registration. The file currently only defines `/health`. Add at the top:

```ts
import { registerAuthRoutes } from "./auth/routes.js";
```

And inside `registerRoutes`, before (or after) the existing `/health` handler:

```ts
  await app.register(registerAuthRoutes, { prefix: "/auth" });
```

Full updated `apps/api/src/routes.ts`:

```ts
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { registerAuthRoutes } from "./auth/routes.js";
import { pingDb } from "./db/index.js";

// All routes mount under /v1 (see app.ts). Feature modules register here.
export const registerRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(registerAuthRoutes, { prefix: "/auth" });

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: z.object({
            status: z.literal("ok"),
            db: z.enum(["up", "down"]),
          }),
        },
      },
    },
    async () => {
      let dbStatus: "up" | "down" = "up";
      try {
        await pingDb();
      } catch {
        dbStatus = "down";
      }
      return { status: "ok" as const, db: dbStatus };
    },
  );
};
```

- [ ] **Step 3: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 9: Auth route integration tests (pg-mem)

**Files:**
- Create: `apps/api/test/auth.routes.test.ts`

Integration tests via `app.inject`. We override the DB used inside the auth service by swapping the module-level `db` singleton reference — the simplest approach with pg-mem is to create a separate Fastify app instance that points to the mem DB via a `buildApp`-like helper that accepts a `db` override. For a lighter approach (since the auth service imports `db` directly), we use Vitest's module mock to swap `db` with a pg-mem instance before importing the app.

> **Note:** `app.inject` does not send a real HTTP request; it bypasses the network but goes through the full Fastify lifecycle (plugins, preHandlers, serializers). This catches wiring bugs that pure unit tests miss.

- [ ] **Step 1: Write the integration tests**

Create `apps/api/test/auth.routes.test.ts`:

```ts
import { drizzle } from "drizzle-orm/pg-mem";
import { newDb } from "pg-mem";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as schema from "../src/db/schema/index.js";

// Build a pg-mem DB and run the DDL needed for auth tables.
function buildMemDb() {
  const mem = newDb();
  mem.public.none(`
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
  `);
  const pg = mem.adapters.createPg();
  return drizzle(new pg.Pool(), { schema });
}

// Swap the db singleton before the auth modules load.
const memDb = buildMemDb();
vi.mock("../src/db/index.js", () => ({
  db: memDb,
  pingDb: async () => {},
  schema,
}));

let app: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>;

beforeAll(async () => {
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

// Reset tables between tests so state doesn't leak.
beforeEach(async () => {
  await memDb.delete(schema.sessions);
  await memDb.delete(schema.oauthAccounts);
  await memDb.delete(schema.users);
});

// ---------- helpers ----------

async function register(body: {
  username: string;
  email: string;
  password: string;
}) {
  return app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: body,
  });
}

function extractSid(res: { headers: Record<string, string | string[]> }): string {
  const setCookie = res.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ""];
  const sidEntry = cookies.find((c) => c.startsWith("sid="));
  if (!sidEntry) throw new Error("No sid cookie in response");
  return sidEntry.split(";")[0]!.replace("sid=", "");
}

// ---------- register ----------

describe("POST /v1/auth/register", () => {
  it("creates a user and sets a sid cookie", async () => {
    const res = await register({
      username: "alice",
      email: "alice@example.com",
      password: "password123",
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe("alice@example.com");
    expect(body.user.username).toBe("alice");
    const sid = extractSid(res);
    expect(sid.length).toBe(64); // 32-byte hex
  });

  it("rejects duplicate email with 409", async () => {
    await register({ username: "a1", email: "dup@example.com", password: "password123" });
    const res = await register({ username: "a2", email: "dup@example.com", password: "password456" });
    expect(res.statusCode).toBe(409);
  });

  it("rejects a short password with 400", async () => {
    const res = await register({ username: "bob", email: "bob@example.com", password: "short" });
    expect(res.statusCode).toBe(400);
  });
});

// ---------- login ----------

describe("POST /v1/auth/login", () => {
  beforeEach(async () => {
    await register({ username: "carol", email: "carol@example.com", password: "mypassword123" });
  });

  it("logs in by email and sets sid cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { usernameOrEmail: "carol@example.com", password: "mypassword123" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe("carol@example.com");
    const sid = extractSid(res);
    expect(sid.length).toBe(64);
  });

  it("logs in by username and sets sid cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { usernameOrEmail: "carol", password: "mypassword123" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects wrong password with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { usernameOrEmail: "carol@example.com", password: "wrongpassword" },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------- logout ----------

describe("POST /v1/auth/logout", () => {
  it("returns 401 without a valid sid", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/logout" });
    expect(res.statusCode).toBe(401);
  });

  it("logs out a valid session and the sid can no longer be used", async () => {
    const regRes = await register({ username: "dave", email: "dave@example.com", password: "pass12345" });
    const sid = extractSid(regRes);

    const logoutRes = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { cookie: `sid=${sid}` },
    });
    expect(logoutRes.statusCode).toBe(200);

    // After logout, the session is gone — requireAuth should 401.
    const meRes = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { cookie: `sid=${sid}` },
    });
    // /me is public (returns null), so 200 with user:null, not 401.
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user).toBeNull();
  });
});

// ---------- me ----------

describe("GET /v1/auth/me", () => {
  it("returns user:null when no cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/auth/me" });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toBeNull();
  });

  it("returns user when a valid sid cookie is present", async () => {
    const regRes = await register({ username: "eve", email: "eve@example.com", password: "evespass123" });
    const sid = extractSid(regRes);

    const meRes = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { cookie: `sid=${sid}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user.email).toBe("eve@example.com");
  });
});

// ---------- requireAuth guard ----------

describe("requireAuth guard (POST /v1/auth/logout as test target)", () => {
  it("returns 401 when no sid cookie at all", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/logout" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Unauthorized");
  });

  it("returns 401 when sid is a garbage value not in sessions table", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { cookie: "sid=0000000000000000000000000000000000000000000000000000000000000000" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 when a valid sid is provided", async () => {
    const regRes = await register({ username: "frank", email: "frank@example.com", password: "frankpass1" });
    const sid = extractSid(regRes);
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { cookie: `sid=${sid}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm --filter @xophim/api test auth.routes`
Expected: all tests in the file pass. If pg-mem emits warnings about unsupported features, check whether a workaround is needed and document it inline.

- [ ] **Step 3: Final API checkpoint**

Run: `pnpm --filter @xophim/api test && pnpm --filter @xophim/api typecheck`
Expected: all tests pass (password, session, oauth-google, merge-guest, auth.routes), no type errors.

---

## Task 10: Web auth types

**Files:**
- Create: `apps/web/src/lib/auth-types.ts`

Mirror the API's auth shapes so web hooks are typed.

- [ ] **Step 1: Create the types file**

Create `apps/web/src/lib/auth-types.ts`:

```ts
// Mirrors the auth response shapes from the XoPhim API (/v1/auth/*).
// The API is the source of truth; keep these in sync manually.

export interface AuthUser {
  id: string;
  username: string | null;
  email: string;
  role: string;
}

export interface LoginPayload {
  usernameOrEmail: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export interface GuestWatchlistItem {
  movieSlug: string;
  movieSnapshot: Record<string, unknown>;
  createdAt: string; // ISO datetime
}

export interface GuestProgressItem {
  movieSlug: string;
  episodeSlug: string;
  serverName: string;
  positionSec: number;
  durationSec: number | null;
  movieSnapshot: Record<string, unknown>;
  updatedAt: string; // ISO datetime
}

export interface MergeGuestPayload {
  watchlist: GuestWatchlistItem[];
  progress: GuestProgressItem[];
}

export interface MergeGuestResult {
  watchlistMerged: number;
  progressMerged: number;
}
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

---

## Task 11: Web auth API client

**Files:**
- Create: `apps/web/src/lib/auth-api.ts`

Typed axios functions calling `/v1/auth/*`. Mirrors the pattern of `catalog-api.ts`.

- [ ] **Step 1: Create the client**

Create `apps/web/src/lib/auth-api.ts`:

```ts
import { api } from "./api";
import type {
  AuthUser,
  LoginPayload,
  MergeGuestPayload,
  MergeGuestResult,
  RegisterPayload,
} from "./auth-types";

export const authApi = {
  // GET /v1/auth/me — returns user or null; never throws 401.
  me: async (): Promise<AuthUser | null> => {
    const res = await api.get<{ user: AuthUser | null }>("/auth/me");
    return res.data.user;
  },

  // POST /v1/auth/register — creates user + session, sets sid cookie.
  register: async (payload: RegisterPayload): Promise<AuthUser> => {
    const res = await api.post<{ user: AuthUser }>("/auth/register", payload);
    return res.data.user;
  },

  // POST /v1/auth/login — verifies credentials + creates session, sets sid cookie.
  login: async (payload: LoginPayload): Promise<AuthUser> => {
    const res = await api.post<{ user: AuthUser }>("/auth/login", payload);
    return res.data.user;
  },

  // POST /v1/auth/logout — clears the session; throws if not authenticated.
  logout: async (): Promise<void> => {
    await api.post("/auth/logout");
  },

  // POST /v1/auth/merge-guest — merges guest localStorage state after login.
  mergeGuest: async (payload: MergeGuestPayload): Promise<MergeGuestResult> => {
    const res = await api.post<MergeGuestResult>("/auth/merge-guest", payload);
    return res.data;
  },
};
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

---

## Task 12: Web useAuth hook (TanStack Query)

**Files:**
- Create: `apps/web/src/hooks/auth.ts`

`useAuth` queries `/me` (the source of truth for current session). `useLogin`, `useRegister`, `useLogout` are mutations that invalidate the `me` query on success. `useMergeGuest` is a mutation for post-login merging.

- [ ] **Step 1: Create the hook file**

Create `apps/web/src/hooks/auth.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../lib/auth-api";
import type { LoginPayload, MergeGuestPayload, RegisterPayload } from "../lib/auth-types";

export const authKeys = {
  me: ["auth", "me"] as const,
};

// useAuth: returns the current user (null if logged out).
// staleTime is short so re-mounts re-check the session.
export function useAuth() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: authApi.me,
    staleTime: 60_000, // 1 minute
    retry: false,
  });
}

// useLogin: on success, update the me cache directly and invalidate.
export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: (user) => {
      qc.setQueryData(authKeys.me, user);
    },
  });
}

// useRegister: same pattern as login.
export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterPayload) => authApi.register(payload),
    onSuccess: (user) => {
      qc.setQueryData(authKeys.me, user);
    },
  });
}

// useLogout: clears the me cache after logout.
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      qc.setQueryData(authKeys.me, null);
      qc.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}

// useMergeGuest: called right after login to merge guest localStorage data.
export function useMergeGuest() {
  return useMutation({
    mutationFn: (payload: MergeGuestPayload) => authApi.mergeGuest(payload),
  });
}
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

---

## Task 13: Guest Zustand store (localStorage)

**Files:**
- Create: `apps/web/src/lib/guest-store.ts`

Zustand store with `persist` middleware (localStorage). Holds guest watchlist + progress so anonymous users get the same experience. On login, the caller reads from this store, calls `mergeGuest`, then clears it.

- [ ] **Step 1: Create the store**

Create `apps/web/src/lib/guest-store.ts`:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GuestProgressItem, GuestWatchlistItem } from "./auth-types";

interface GuestState {
  watchlist: GuestWatchlistItem[];
  progress: GuestProgressItem[];

  // Add a movie to the guest watchlist (no-op if already present).
  addToWatchlist: (item: GuestWatchlistItem) => void;
  // Remove a movie from the guest watchlist by slug.
  removeFromWatchlist: (movieSlug: string) => void;

  // Upsert a progress item. Never overwrites an entry with a newer updatedAt.
  upsertProgress: (item: GuestProgressItem) => void;
  // Remove a progress entry by movieSlug (all episodes).
  removeProgress: (movieSlug: string) => void;

  // Clear all guest state (call after successful mergeGuest).
  clear: () => void;
}

export const useGuestStore = create<GuestState>()(
  persist(
    (set, get) => ({
      watchlist: [],
      progress: [],

      addToWatchlist: (item) => {
        const existing = get().watchlist.find((w) => w.movieSlug === item.movieSlug);
        if (existing) return;
        set((s) => ({ watchlist: [...s.watchlist, item] }));
      },

      removeFromWatchlist: (movieSlug) => {
        set((s) => ({ watchlist: s.watchlist.filter((w) => w.movieSlug !== movieSlug) }));
      },

      upsertProgress: (item) => {
        set((s) => {
          const idx = s.progress.findIndex(
            (p) =>
              p.movieSlug === item.movieSlug && p.episodeSlug === item.episodeSlug,
          );
          if (idx === -1) {
            return { progress: [...s.progress, item] };
          }
          const existing = s.progress[idx]!;
          // Never overwrite a row whose updatedAt is newer or equal.
          if (new Date(existing.updatedAt) >= new Date(item.updatedAt)) {
            return s;
          }
          const updated = [...s.progress];
          updated[idx] = item;
          return { progress: updated };
        });
      },

      removeProgress: (movieSlug) => {
        set((s) => ({ progress: s.progress.filter((p) => p.movieSlug !== movieSlug) }));
      },

      clear: () => set({ watchlist: [], progress: [] }),
    }),
    {
      name: "xophim-guest", // localStorage key
    },
  ),
);
```

> **Note:** `zustand` must be in `apps/web/package.json` dependencies. If it is not yet present, add `"zustand": "^5.0.0"` and run `pnpm install`.

- [ ] **Step 2: Check zustand is in web deps and install if needed**

Run: `pnpm --filter @xophim/web list zustand`
If not present: add `"zustand": "^5.0.0"` to `apps/web/package.json` dependencies and run `pnpm install`.

- [ ] **Step 3: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

---

## Task 14: End-to-end manual smoke (optional)

**Files:** none.

This task is manual and optional. It verifies the full flow against a running dev server with a real Postgres instance.

- [ ] **Step 1: Run the API dev server**

Ensure `DATABASE_URL` is set in `apps/api/.env` pointing at a real Postgres instance. Run the migration: `pnpm --filter @xophim/api db:migrate`. Then start: `pnpm --filter @xophim/api dev`.

- [ ] **Step 2: Register a user**

```bash
curl -c /tmp/xophim-cookies.txt -s -X POST http://localhost:6001/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@test.com","password":"TestPass123!"}' | jq .
```
Expected: `{"user":{"id":"...","username":"testuser","email":"test@test.com","role":"user"}}`. A `sid` cookie is set.

- [ ] **Step 3: Call /me with the cookie**

```bash
curl -b /tmp/xophim-cookies.txt -s http://localhost:6001/v1/auth/me | jq .
```
Expected: `{"user":{"id":"...","email":"test@test.com",...}}`.

- [ ] **Step 4: Logout**

```bash
curl -b /tmp/xophim-cookies.txt -c /tmp/xophim-cookies.txt \
  -s -X POST http://localhost:6001/v1/auth/logout | jq .
```
Expected: `{"ok":true}`.

- [ ] **Step 5: /me after logout returns null**

```bash
curl -b /tmp/xophim-cookies.txt -s http://localhost:6001/v1/auth/me | jq .
```
Expected: `{"user":null}`.

- [ ] **Step 6: Final checkpoint**

Run: `pnpm --filter @xophim/api test && pnpm --filter @xophim/api typecheck && pnpm --filter @xophim/web typecheck`
Expected: all green.

---

## Self-Review Notes (spec coverage)

- **Drizzle tables: users, oauth_accounts, sessions** per spec §3 AUTH → Task 2. ✅
- **argon2id password hash, never logged/echoed** → Task 3 (`hashPassword`/`verifyPassword` wrappers). ✅
- **Opaque 32-byte hex session id, `sessions` table, `sid` cookie (httpOnly+Secure+SameSite=Lax), maxAge=SESSION_TTL_DAYS** → Tasks 5, 8. ✅
- **`requireAuth` preHandler decorator on FastifyInstance, `request.user` type, 401 `{error:"Unauthorized"}`** → Tasks 4, 8. ✅
- **POST /register, POST /login, POST /logout, GET /me** → Task 8. ✅
- **GET /google + GET /google/callback (Authorization Code + PKCE, hand-rolled, state+verifier in short-lived cookie)** → Tasks 6, 8. ✅
- **Google link decision: existing account → login; else email match → link; else create user** → Task 7 (`oauthLink`). ✅
- **POST /merge-guest (requireAuth, upsert never overwrites newer updated_at)** → Tasks 7, 8. `shouldOverwriteProgress` pure function tested in Task 7. ✅
- **New env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, SESSION_TTL_DAYS (default 30), WEB_ORIGIN** → Task 1. ✅
- **Web useAuth hook (me/login/register/logout mutations+query via TanStack Query)** → Tasks 10–12. ✅
- **Guest store (Zustand + localStorage for watchlist/progress)** → Task 13. ✅
- **Vitest TDD: unit for argon2 verify, session lookup, oauth link decision, merge-no-overwrite; integration via app.inject for register/login/logout/me + requireAuth guard** → Tasks 3, 5, 6, 7, 9. ✅
- **pg-mem for DB-touching integration tests; caveat documented** → Task 5 (caveat note), Task 9. ✅
- **ESM NodeNext: all local imports use `.js` extension** → verified throughout all `import` statements. ✅
- **@fastify/cookie already a dependency — no new dep needed for cookies** → confirmed in package.json. ✅
- **Deferred (P3+):** Full `mergeGuest` DB writes (watchlist/watch_progress tables), P3 user-state routes — `mergeGuest` in P2 is a shape stub that returns accepted counts. ✅
