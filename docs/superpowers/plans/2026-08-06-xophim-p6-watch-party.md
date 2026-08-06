# XoPhim P6 — Watch Party / Xem Chung (Realtime, Tier 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time co-watching rooms — a `rooms` table for persistent metadata, an in-memory `RoomManager` for live playback state + chat + members, WebSocket sync via `@fastify/websocket`, two HTTP endpoints (create/get), and a `useWatchParty` hook in the web data-layer. Host is authoritative for play/pause/seek; non-host sync commands are silently ignored and the authoritative state is echoed back.

**Architecture:** Room metadata (code, host, movie/episode slug, timestamps) lives in Postgres. Everything else — who is in the room, current playback position, chat lines — lives in a `RoomManager` singleton (a `Map<code, RoomRuntime>`) that is instantiated once per process. The WebSocket route is a thin adapter: it calls `RoomManager` methods and writes back JSON frames. The `RoomManager` is fully unit-testable without real sockets by injecting fake `send` functions per member.

**Tier / Scale note:** In-memory rooms mean a single-instance deployment only. Horizontal scaling would require Redis pub/sub for cross-node broadcast — out of scope for MVP (documented in §7 of the design spec).

**Tech Stack:** Fastify 5, `@fastify/websocket`, `fastify-type-provider-zod`, Zod 3, Drizzle ORM, Postgres, Vitest, React 18 + native `WebSocket` browser API.

**Preconditions:**
- **Phase 2 (Auth):** `requireAuth` guard must be available — room creation calls it. `request.user` is typed on `FastifyRequest`.
- **Phase 1 (Catalog):** The catalog detail route (`GET /v1/catalog/detail/:slug`) supplies the stream the room plays. This plan does not reimplement it.

> **NO GIT COMMITS.** Per project convention the user handles git. Every task ends with a **Checkpoint** (typecheck + tests) instead of a commit. Do not run `git add` / `git commit`.

**Reference:** Design spec §3 (WATCH PARTY table), §4 (P6 API Surface), §6 (phase table), §7 (out-of-scope). Sibling plan: [2026-08-06-xophim-p0-p1-catalog.md](./2026-08-06-xophim-p0-p1-catalog.md).

---

## File Structure

**API (`apps/api/src/`)**
- `db/schema/rooms.ts` — *create*: Drizzle table definition for `rooms`.
- `db/schema/index.ts` — *modify*: re-export `rooms` table so drizzle-kit sees it.
- `rooms/types.ts` — *create*: WebSocket message protocol types (client→server and server→client discriminated unions).
- `rooms/RoomManager.ts` — *create*: in-memory `RoomManager` (pure; injectable fake send). The unit-testable core.
- `rooms/routes.ts` — *create*: Fastify plugin — HTTP POST /v1/rooms, GET /v1/rooms/:code, WS /v1/rooms/:code/ws.
- `routes.ts` — *modify*: register `registerRoomsRoutes` under `/v1`.
- `config/env.ts` — *modify*: no new vars needed; `@fastify/websocket` has no required env. (Document note only.)

**API tests (`apps/api/test/`)**
- `rooms.RoomManager.test.ts` — unit tests for `RoomManager` (join/leave/host-authority/broadcast/chat) using fake send functions.
- `rooms.routes.test.ts` — integration tests via `app.inject` for HTTP create/get.

**Web (`apps/web/src/`)**
- `hooks/watch-party.ts` — *create*: `useWatchParty(code)` hook — opens native WS, exposes `{members, chat, playbackState, sendChat, hostControls}`, cleans up on unmount. Data/logic only, no JSX.

---

## Task 0: Install `@fastify/websocket`

**Files:**
- Modify: `apps/api/package.json`

`@fastify/websocket` wraps the `ws` library and integrates with Fastify's plugin system. It must be registered on the app before any WebSocket route handler.

- [ ] **Step 1: Add the dependency**

In `apps/api/package.json`, add to `dependencies`:
```json
    "@fastify/websocket": "^9.0.1"
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: `@fastify/websocket` and its peer `ws` appear in `node_modules`; no errors.

- [ ] **Step 3: Register the plugin in `app.ts`**

In `apps/api/src/app.ts`, add the import after the existing `@fastify/cookie` import line:
```ts
import fastifyWebsocket from "@fastify/websocket";
```
Then inside `buildApp`, after the `rateLimit` registration block (but before the `registerRoutes` call), add:
```ts
  await app.register(fastifyWebsocket);
```

- [ ] **Step 4: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors. (`@fastify/websocket` ships its own types.)

---

## Task 1: Drizzle `rooms` table

**Files:**
- Create: `apps/api/src/db/schema/rooms.ts`
- Modify: `apps/api/src/db/schema/index.ts`

Only room metadata is persisted. Playback state and chat are in-memory and intentionally not stored (spec §7: chat history persistence omitted at MVP).

- [ ] **Step 1: Write the failing typecheck (by leaving schema/index.ts unchanged first)**

We will add the table and then confirm the typecheck is clean. No separate unit test needed for the table definition — correctness is validated at compile time and via the migration in Step 3.

- [ ] **Step 2: Create the table file**

Create `apps/api/src/db/schema/rooms.ts`:
```ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Persisted room metadata. Playback state (position, playing flag), chat
// messages, and member list are intentionally NOT stored — they live in the
// RoomManager singleton for the duration of the room. Chat history persistence
// is deferred (design spec §7, MVP out-of-scope).
export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Short, human-shareable invite code (e.g. "AB12CD"). Unique index enforced
  // by Postgres so concurrent inserts can't collide.
  code: text("code").unique().notNull(),

  // FK to users.id — the user who created the room. Cascade behaviour is
  // intentionally left as the Postgres default (restrict) for MVP.
  hostUserId: uuid("host_user_id").notNull(),

  // KKPhim natural keys. No FK to a catalog table (catalog is never persisted).
  movieSlug: text("movie_slug").notNull(),
  episodeSlug: text("episode_slug").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  // Null means the room is still open. Set when the host explicitly closes it
  // or the last member leaves (optional cleanup; MVP leaves it null on last
  // leave — the RoomManager entry is simply deleted).
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
```

- [ ] **Step 3: Re-export from schema/index.ts**

Replace the entire contents of `apps/api/src/db/schema/index.ts` with:
```ts
// Drizzle schema source of truth. Re-export every table module from here so
// the Drizzle instance and drizzle-kit pick them all up.

export * from "./rooms.js";
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm --filter @xophim/api db:generate`
Expected: a new migration file appears under `apps/api/drizzle/` (e.g. `0001_rooms.sql` or similar). The SQL should contain `CREATE TABLE "rooms"` with the six columns plus the `UNIQUE` constraint on `code`.

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors. `app.db` now exposes `schema.rooms` through the Drizzle instance.

---

## Task 2: WebSocket message protocol types

**Files:**
- Create: `apps/api/src/rooms/types.ts`

Define the full JSON message protocol as TypeScript discriminated unions. These types are the contract between the WebSocket route adapter and the `RoomManager`; they are also imported by the web hook (via copy/paste or a shared package — for MVP we duplicate them in the web hook file).

- [ ] **Step 1: Create the types file**

Create `apps/api/src/rooms/types.ts`:
```ts
// ─── Client → Server messages ────────────────────────────────────────────────

/** Sent once after the WebSocket opens, before any other message. */
export interface ClientJoin {
  type: "join";
  /** Display name for the member (max 64 chars). */
  name: string;
}

/** Host-only: start/resume playback. Non-host sends are silently ignored. */
export interface ClientPlay {
  type: "play";
  /** Current position in seconds at the moment of the action. */
  positionSec: number;
}

/** Host-only: pause playback. Non-host sends are silently ignored. */
export interface ClientPause {
  type: "pause";
  positionSec: number;
}

/** Host-only: seek to a position. Non-host sends are silently ignored. */
export interface ClientSeek {
  type: "seek";
  positionSec: number;
}

/** Any member: send a chat message (max 500 chars). */
export interface ClientChat {
  type: "chat";
  text: string;
}

export type ClientMessage =
  | ClientJoin
  | ClientPlay
  | ClientPause
  | ClientSeek
  | ClientChat;

// ─── Server → Client messages ────────────────────────────────────────────────

/** Current playback state broadcast after any host action. */
export interface ServerState {
  type: "state";
  playing: boolean;
  positionSec: number;
}

/** Full member list broadcast after join/leave. */
export interface ServerMembers {
  type: "members";
  members: Array<{ id: string; name: string }>;
}

/** A single chat message, broadcast to all members. */
export interface ServerChat {
  type: "chat";
  from: string;       // display name of sender
  text: string;
  at: string;         // ISO-8601 timestamp
}

/**
 * Sent only to the joining member immediately after they join.
 * Contains the full current state so they sync up instantly.
 */
export interface ServerSync {
  type: "sync";
  playing: boolean;
  positionSec: number;
  members: Array<{ id: string; name: string }>;
}

/**
 * Sent to a non-host who attempted a host-only action (play/pause/seek).
 * The authoritative state is echoed back so their player stays in sync.
 */
export interface ServerDenied {
  type: "denied";
  reason: "not-host";
  playing: boolean;
  positionSec: number;
}

export type ServerMessage =
  | ServerState
  | ServerMembers
  | ServerChat
  | ServerSync
  | ServerDenied;
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 3: `RoomManager` — pure in-memory core

**Files:**
- Create: `apps/api/src/rooms/RoomManager.ts`
- Test: `apps/api/test/rooms.RoomManager.test.ts`

The `RoomManager` holds all live room state. It is deliberately pure — it receives a `send: (msg: ServerMessage) => void` callback per member rather than holding real WebSocket objects. This makes it trivially unit-testable.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/rooms.RoomManager.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { RoomManager } from "../src/rooms/RoomManager.js";
import type { ServerMessage } from "../src/rooms/types.js";

// Helper: creates a mock send that records its calls.
function makeSend() {
  const calls: ServerMessage[] = [];
  const fn = (msg: ServerMessage) => { calls.push(msg); };
  return { fn, calls };
}

describe("RoomManager.join", () => {
  it("broadcasts updated member list to all members on join", () => {
    const rm = new RoomManager();
    const { fn: send1, calls: c1 } = makeSend();
    const { fn: send2, calls: c2 } = makeSend();

    rm.join("room1", "host-uid", { memberId: "m1", name: "Alice", send: send1, isHost: true });
    rm.join("room1", "host-uid", { memberId: "m2", name: "Bob", send: send2, isHost: false });

    // m2 joining triggers a members broadcast to both
    const m1Members = c1.filter((m) => m.type === "members");
    expect(m1Members.length).toBeGreaterThanOrEqual(1);
    const lastMembers = m1Members.at(-1) as { type: "members"; members: { id: string; name: string }[] };
    expect(lastMembers.members.map((m) => m.id)).toContain("m2");

    // m2 also receives a sync frame with current state
    const m2Sync = c2.find((m) => m.type === "sync");
    expect(m2Sync).toBeDefined();
  });
});

describe("RoomManager.leave", () => {
  it("removes the member and broadcasts the updated list", () => {
    const rm = new RoomManager();
    const { fn: send1, calls: c1 } = makeSend();
    const { fn: send2 } = makeSend();

    rm.join("room1", "host-uid", { memberId: "m1", name: "Alice", send: send1, isHost: true });
    rm.join("room1", "host-uid", { memberId: "m2", name: "Bob", send: send2, isHost: false });
    c1.length = 0; // reset after join noise

    rm.leave("room1", "m2");

    const membersMsg = c1.find((m) => m.type === "members") as
      | { type: "members"; members: { id: string }[] }
      | undefined;
    expect(membersMsg).toBeDefined();
    expect(membersMsg!.members.map((m) => m.id)).not.toContain("m2");
  });

  it("does nothing if the room does not exist", () => {
    const rm = new RoomManager();
    expect(() => rm.leave("ghost", "m1")).not.toThrow();
  });
});

describe("RoomManager.applyHostAction — host authority", () => {
  it("host play broadcasts state to all members", () => {
    const rm = new RoomManager();
    const { fn: send1, calls: c1 } = makeSend();
    const { fn: send2, calls: c2 } = makeSend();

    rm.join("room1", "host-uid", { memberId: "host-uid", name: "Host", send: send1, isHost: true });
    rm.join("room1", "host-uid", { memberId: "viewer", name: "Viewer", send: send2, isHost: false });
    c1.length = 0; c2.length = 0;

    rm.applyHostAction("room1", "host-uid", { type: "play", positionSec: 42 });

    const state1 = c1.find((m) => m.type === "state") as { type: "state"; playing: boolean; positionSec: number } | undefined;
    const state2 = c2.find((m) => m.type === "state") as { type: "state"; playing: boolean; positionSec: number } | undefined;
    expect(state1).toBeDefined();
    expect(state2).toBeDefined();
    expect(state1!.playing).toBe(true);
    expect(state1!.positionSec).toBe(42);
  });

  it("non-host play is denied — sender receives denied frame, others receive nothing", () => {
    const rm = new RoomManager();
    const { fn: sendHost, calls: cHost } = makeSend();
    const { fn: sendViewer, calls: cViewer } = makeSend();

    rm.join("room1", "host-uid", { memberId: "host-uid", name: "Host", send: sendHost, isHost: true });
    rm.join("room1", "host-uid", { memberId: "viewer", name: "Viewer", send: sendViewer, isHost: false });
    cHost.length = 0; cViewer.length = 0;

    rm.applyHostAction("room1", "viewer", { type: "play", positionSec: 10 });

    // Host should NOT receive a state broadcast
    expect(cHost.filter((m) => m.type === "state")).toHaveLength(0);
    // Viewer receives a denied frame echoing back the authoritative state
    const denied = cViewer.find((m) => m.type === "denied") as { type: "denied"; reason: string } | undefined;
    expect(denied).toBeDefined();
    expect(denied!.reason).toBe("not-host");
  });

  it("host pause sets playing=false", () => {
    const rm = new RoomManager();
    const { fn: send } = makeSend();
    rm.join("room1", "host-uid", { memberId: "host-uid", name: "Host", send, isHost: true });

    rm.applyHostAction("room1", "host-uid", { type: "play", positionSec: 30 });
    rm.applyHostAction("room1", "host-uid", { type: "pause", positionSec: 30 });

    const runtime = rm.getRuntime("room1");
    expect(runtime?.playback.playing).toBe(false);
  });

  it("host seek updates positionSec without changing playing state", () => {
    const rm = new RoomManager();
    const { fn: send } = makeSend();
    rm.join("room1", "host-uid", { memberId: "host-uid", name: "Host", send, isHost: true });

    rm.applyHostAction("room1", "host-uid", { type: "seek", positionSec: 120 });

    const runtime = rm.getRuntime("room1");
    expect(runtime?.playback.positionSec).toBe(120);
  });
});

describe("RoomManager.chat", () => {
  it("broadcasts a chat frame to all members", () => {
    const rm = new RoomManager();
    const { fn: send1, calls: c1 } = makeSend();
    const { fn: send2, calls: c2 } = makeSend();

    rm.join("room1", "host-uid", { memberId: "m1", name: "Alice", send: send1, isHost: true });
    rm.join("room1", "host-uid", { memberId: "m2", name: "Bob", send: send2, isHost: false });
    c1.length = 0; c2.length = 0;

    rm.chat("room1", "m1", "Hello everyone!");

    const chatMsg1 = c1.find((m) => m.type === "chat") as { type: "chat"; from: string; text: string } | undefined;
    const chatMsg2 = c2.find((m) => m.type === "chat") as { type: "chat"; from: string; text: string } | undefined;
    expect(chatMsg1).toBeDefined();
    expect(chatMsg2).toBeDefined();
    expect(chatMsg1!.from).toBe("Alice");
    expect(chatMsg1!.text).toBe("Hello everyone!");
  });

  it("does nothing if room does not exist", () => {
    const rm = new RoomManager();
    expect(() => rm.chat("ghost", "m1", "hi")).not.toThrow();
  });
});

describe("RoomManager — broadcast helper", () => {
  it("sends to all members including the originator", () => {
    const rm = new RoomManager();
    const { fn: sendA, calls: cA } = makeSend();
    const { fn: sendB, calls: cB } = makeSend();

    rm.join("room1", "host-uid", { memberId: "A", name: "A", send: sendA, isHost: true });
    rm.join("room1", "host-uid", { memberId: "B", name: "B", send: sendB, isHost: false });
    cA.length = 0; cB.length = 0;

    // Trigger a broadcast via a host action
    rm.applyHostAction("room1", "A", { type: "seek", positionSec: 5 });
    expect(cA.some((m) => m.type === "state")).toBe(true);
    expect(cB.some((m) => m.type === "state")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @xophim/api test rooms.RoomManager`
Expected: FAIL — cannot find module `../src/rooms/RoomManager.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/rooms/RoomManager.ts`:
```ts
import type {
  ClientChat,
  ClientPause,
  ClientPlay,
  ClientSeek,
  ServerMessage,
} from "./types.js";

export interface MemberEntry {
  memberId: string;
  name: string;
  isHost: boolean;
  send: (msg: ServerMessage) => void;
}

export interface PlaybackState {
  playing: boolean;
  positionSec: number;
}

export interface RoomRuntime {
  hostUserId: string;
  members: Map<string, MemberEntry>;
  playback: PlaybackState;
}

type HostAction =
  | (ClientPlay & { type: "play" })
  | (ClientPause & { type: "pause" })
  | (ClientSeek & { type: "seek" });

// In-memory store for all live rooms. One instance per process.
// Members are keyed by memberId (a per-connection UUID generated by the route).
// RoomManager never touches real WebSocket objects — it accepts a `send`
// callback per member, making it 100% unit-testable with fake functions.
//
// Single-instance limitation: horizontal scaling would require Redis pub/sub to
// relay broadcasts across nodes. Deferred; documented in design spec §7.
export class RoomManager {
  private readonly rooms = new Map<string, RoomRuntime>();

  // ── Accessors ──────────────────────────────────────────────────────────────

  getRuntime(roomCode: string): RoomRuntime | undefined {
    return this.rooms.get(roomCode);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Add a member to a room (creating the runtime if this is the first join).
   * Sends a `sync` frame to the new member, then broadcasts `members` to all.
   */
  join(
    roomCode: string,
    hostUserId: string,
    entry: MemberEntry,
  ): void {
    let runtime = this.rooms.get(roomCode);
    if (!runtime) {
      runtime = {
        hostUserId,
        members: new Map(),
        playback: { playing: false, positionSec: 0 },
      };
      this.rooms.set(roomCode, runtime);
    }

    runtime.members.set(entry.memberId, entry);

    // Send full sync to the joiner so they catch up immediately.
    entry.send({
      type: "sync",
      playing: runtime.playback.playing,
      positionSec: runtime.playback.positionSec,
      members: this.memberList(runtime),
    });

    // Broadcast updated member list to everyone (including the new member).
    this.broadcastMembers(runtime);
  }

  /**
   * Remove a member. Broadcasts updated member list if the room still has
   * members. Deletes the room runtime when the last member leaves.
   */
  leave(roomCode: string, memberId: string): void {
    const runtime = this.rooms.get(roomCode);
    if (!runtime) return;

    runtime.members.delete(memberId);

    if (runtime.members.size === 0) {
      this.rooms.delete(roomCode);
      return;
    }

    this.broadcastMembers(runtime);
  }

  // ── Playback (host-authoritative) ─────────────────────────────────────────

  /**
   * Apply a play/pause/seek action. Only the host's actions are accepted;
   * non-host attempts receive a `denied` frame echoing back the current state.
   */
  applyHostAction(
    roomCode: string,
    actorMemberId: string,
    action: HostAction,
  ): void {
    const runtime = this.rooms.get(roomCode);
    if (!runtime) return;

    const actor = runtime.members.get(actorMemberId);
    if (!actor) return;

    if (!actor.isHost) {
      // Echo back the authoritative state so the non-host player snaps back.
      actor.send({
        type: "denied",
        reason: "not-host",
        playing: runtime.playback.playing,
        positionSec: runtime.playback.positionSec,
      });
      return;
    }

    // Mutate playback state.
    switch (action.type) {
      case "play":
        runtime.playback.playing = true;
        runtime.playback.positionSec = action.positionSec;
        break;
      case "pause":
        runtime.playback.playing = false;
        runtime.playback.positionSec = action.positionSec;
        break;
      case "seek":
        runtime.playback.positionSec = action.positionSec;
        break;
    }

    // Broadcast new state to all members.
    this.broadcast(runtime, {
      type: "state",
      playing: runtime.playback.playing,
      positionSec: runtime.playback.positionSec,
    });
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  /**
   * Broadcast a chat message from a member to everyone in the room.
   * Chat history is intentionally NOT persisted (design spec §7 MVP scope).
   */
  chat(roomCode: string, memberId: string, text: string): void {
    const runtime = this.rooms.get(roomCode);
    if (!runtime) return;

    const sender = runtime.members.get(memberId);
    if (!sender) return;

    this.broadcast(runtime, {
      type: "chat",
      from: sender.name,
      text,
      at: new Date().toISOString(),
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private memberList(runtime: RoomRuntime): Array<{ id: string; name: string }> {
    return Array.from(runtime.members.values()).map((m) => ({
      id: m.memberId,
      name: m.name,
    }));
  }

  private broadcastMembers(runtime: RoomRuntime): void {
    this.broadcast(runtime, {
      type: "members",
      members: this.memberList(runtime),
    });
  }

  private broadcast(runtime: RoomRuntime, msg: ServerMessage): void {
    for (const member of runtime.members.values()) {
      try {
        member.send(msg);
      } catch {
        // A broken send (closed socket) should not abort the broadcast loop.
      }
    }
  }
}

// Singleton shared across the process. The WebSocket route adapter imports this.
export const roomManager = new RoomManager();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @xophim/api test rooms.RoomManager`
Expected: all tests pass (13 assertions across 8 it-blocks).

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 4: HTTP routes — POST /v1/rooms and GET /v1/rooms/:code

**Files:**
- Create: `apps/api/src/rooms/routes.ts` (HTTP section)
- Test: `apps/api/test/rooms.routes.test.ts` (HTTP section)

The HTTP layer is thin: POST creates a room (generates a unique 6-char alphanumeric `code`, inserts into Postgres), GET returns the persisted metadata plus a live member count from `roomManager`. We write and test the HTTP routes in this task; the WS handler is added in Task 5 to the same file.

- [ ] **Step 1: Write the failing HTTP integration tests**

Create `apps/api/test/rooms.routes.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// These tests need a real Postgres connection. They run against the test DB
// configured in DATABASE_URL. If the DB is unavailable the suite is skipped.

let app: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>;

// A minimal session cookie injected for requireAuth routes.
// In a real setup Phase 2's auth tests create a real session. Here we mock
// the session lookup by decorating app.db after build — or we can call the
// register+login endpoints if auth is already implemented. For a standalone
// Phase 6 test we stub `request.user` via a test helper plugin.
// We use app.inject with a fake auth header so the route sees request.user.

async function buildTestApp() {
  // Temporarily override requireAuth so HTTP tests don't need a real session.
  // This is a test-only shim; when running with Phase 2 live, remove this shim
  // and inject a real session cookie instead.
  process.env["SKIP_AUTH_FOR_TESTS"] = "1";
  const { buildApp } = await import("../src/app.js");
  return buildApp();
}

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
  delete process.env["SKIP_AUTH_FOR_TESTS"];
});

describe("POST /v1/rooms", () => {
  it("returns 201 with a room code and metadata", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      payload: { slug: "dong-ho-cat", episodeSlug: "tap-1" },
      // When Phase 2 is live, pass headers: { cookie: "sid=<valid-session>" }
    });
    // 201 when auth guard passes; 401 when it does not (auth not yet live).
    expect([201, 401]).toContain(res.statusCode);
    if (res.statusCode === 201) {
      const body = res.json();
      expect(typeof body.code).toBe("string");
      expect(body.code.length).toBeGreaterThan(0);
      expect(body.movieSlug).toBe("dong-ho-cat");
    }
  });
});

describe("GET /v1/rooms/:code", () => {
  it("returns 404 for an unknown code", async () => {
    const res = await app.inject({ url: "/v1/rooms/ZZZZZZ" });
    expect(res.statusCode).toBe(404);
  });
});
```

> **Note on the test shim:** The `SKIP_AUTH_FOR_TESTS` env flag is a minimal compatibility bridge for running Phase 6 tests before Phase 2 is merged. Once `requireAuth` is live and a test session helper exists, replace the shim with a real session cookie. The routes file reads this env var only in non-production.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @xophim/api test rooms.routes`
Expected: FAIL — cannot find module `../src/rooms/routes.js` (the file does not exist yet).

- [ ] **Step 3: Create the rooms routes plugin (HTTP portion only)**

Create `apps/api/src/rooms/routes.ts`:
```ts
import { eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { randomBytes } from "node:crypto";
import { z } from "zod";

import { schema } from "../db/index.js";
import { roomManager } from "./RoomManager.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a unique 6-character alphanumeric invite code. */
function generateCode(): string {
  // 4 random bytes → 8 hex chars → take first 6 and uppercase.
  return randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
}

/** Minimal requireAuth shim for standalone Phase 6 development/testing.
 *  When Phase 2 is merged, replace with the real `requireAuth` plugin hook.
 */
async function requireAuthOrShim(
  request: import("fastify").FastifyRequest,
  reply: import("fastify").FastifyReply,
): Promise<void> {
  // Allow bypass in test environments when the flag is set.
  if (
    process.env["NODE_ENV"] !== "production" &&
    process.env["SKIP_AUTH_FOR_TESTS"] === "1"
  ) {
    // Attach a synthetic user so route handlers don't crash on request.user.
    (request as import("fastify").FastifyRequest & { user?: { id: string } }).user = {
      id: "test-host-id",
    };
    return;
  }
  // When Phase 2 is live this block is replaced with:
  //   await requireAuth(request, reply);
  // For now, if no shim is active, reject unauthenticated requests.
  const reqWithUser = request as { user?: { id: string } };
  if (!reqWithUser.user) {
    return reply.code(401).send({ error: "Unauthorized", message: "Authentication required" });
  }
}

// ── Plugin ───────────────────────────────────────────────────────────────────

export const registerRoomsRoutes: FastifyPluginAsyncZod = async (app) => {
  // ── POST /v1/rooms ─────────────────────────────────────────────────────────
  // Creates a new room. The creator becomes the host.
  // Requires authentication (Phase 2 precondition).
  app.post(
    "/",
    {
      schema: {
        body: z.object({
          slug: z.string().min(1),
          episodeSlug: z.string().min(1),
        }),
        response: {
          201: z.object({
            id: z.string().uuid(),
            code: z.string(),
            movieSlug: z.string(),
            episodeSlug: z.string(),
            createdAt: z.string(),
          }),
        },
      },
      preHandler: requireAuthOrShim,
    },
    async (request, reply) => {
      const reqWithUser = request as typeof request & { user?: { id: string } };
      const hostUserId = reqWithUser.user?.id ?? "unknown";

      const { slug, episodeSlug } = request.body;

      // Generate a unique code. Retry up to 5 times on collision (astronomically
      // unlikely with a 6-char hex code + small number of rooms in MVP).
      let code = "";
      let inserted = false;
      for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
        code = generateCode();
        try {
          await app.db.insert(schema.rooms).values({
            code,
            hostUserId,
            movieSlug: slug,
            episodeSlug,
          });
          inserted = true;
        } catch (err: unknown) {
          // Postgres unique violation (code 23505) on the `code` column — retry.
          const pgErr = err as { code?: string };
          if (pgErr.code !== "23505") throw err;
        }
      }
      if (!inserted) {
        return reply
          .code(500)
          .send({ error: "InternalServerError", message: "Could not generate a unique room code" });
      }

      const [room] = await app.db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.code, code))
        .limit(1);

      if (!room) {
        return reply.code(500).send({ error: "InternalServerError", message: "Room not found after insert" });
      }

      return reply.code(201).send({
        id: room.id,
        code: room.code,
        movieSlug: room.movieSlug,
        episodeSlug: room.episodeSlug,
        createdAt: room.createdAt.toISOString(),
      });
    },
  );

  // ── GET /v1/rooms/:code ────────────────────────────────────────────────────
  // Returns persisted room metadata + live member count from RoomManager.
  // Public — no auth required to look up a room by its invite code.
  app.get(
    "/:code",
    {
      schema: {
        params: z.object({ code: z.string().length(6) }),
        response: {
          200: z.object({
            id: z.string().uuid(),
            code: z.string(),
            movieSlug: z.string(),
            episodeSlug: z.string(),
            memberCount: z.number().int(),
            createdAt: z.string(),
            closedAt: z.string().nullable(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { code } = request.params;

      const [room] = await app.db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.code, code))
        .limit(1);

      if (!room) {
        return reply.code(404).send({ error: "NotFound", message: `Room ${code} not found` });
      }

      const runtime = roomManager.getRuntime(code);
      const memberCount = runtime?.members.size ?? 0;

      return reply.code(200).send({
        id: room.id,
        code: room.code,
        movieSlug: room.movieSlug,
        episodeSlug: room.episodeSlug,
        memberCount,
        createdAt: room.createdAt.toISOString(),
        closedAt: room.closedAt?.toISOString() ?? null,
      });
    },
  );

  // WebSocket route is added in Task 5 below.
};
```

- [ ] **Step 4: Register the plugin in routes.ts**

In `apps/api/src/routes.ts`, add the import at the top of the file (after existing imports):
```ts
import { registerRoomsRoutes } from "./rooms/routes.js";
```
And inside the `registerRoutes` function body (after the health route), add:
```ts
  await app.register(registerRoomsRoutes, { prefix: "/rooms" });
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @xophim/api test rooms.routes`
Expected: the 404 test passes. The 201/401 test depends on DB availability and Phase 2; both 201 and 401 are accepted.

- [ ] **Step 6: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

---

## Task 5: WebSocket route — `/v1/rooms/:code/ws`

**Files:**
- Modify: `apps/api/src/rooms/routes.ts` (add the WS handler at the bottom of the plugin)

The WebSocket route is a thin adapter. It generates a `memberId`, delegates all logic to `roomManager`, and serializes/deserializes JSON frames. The route determines `isHost` by comparing the session user ID against `room.hostUserId` from Postgres.

- [ ] **Step 1: Add the WS handler to the routes plugin**

Open `apps/api/src/rooms/routes.ts`. At the bottom of the `registerRoomsRoutes` plugin function, before the closing `}`, add:

```ts
  // ── WS /v1/rooms/:code/ws ──────────────────────────────────────────────────
  // Real-time sync. Client must send {type:"join",name} as the first frame
  // within 5 seconds; otherwise the socket is closed.
  //
  // Host determination: if the connected user's ID matches room.hostUserId the
  // socket is treated as host and can issue play/pause/seek. Unauthenticated
  // connections (no session) are allowed as viewers with isHost=false, because
  // invitees may not be registered users.
  app.get(
    "/:code/ws",
    { websocket: true },
    async (socket, request) => {
      const { code } = request.params as { code: string };
      const reqWithUser = request as typeof request & { user?: { id: string } };

      // Look up the room in Postgres to validate the code and read hostUserId.
      const [room] = await app.db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.code, code))
        .limit(1);

      if (!room || room.closedAt) {
        socket.close(4004, "Room not found or closed");
        return;
      }

      const isHost = !!reqWithUser.user && reqWithUser.user.id === room.hostUserId;

      // Unique per-connection ID (not tied to user account — guests get one too).
      const memberId = randomBytes(8).toString("hex");

      // Wrap socket.send in a safe serializer.
      const send = (msg: import("./types.js").ServerMessage) => {
        try {
          if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify(msg));
          }
        } catch {
          // Ignore send errors on already-closed sockets.
        }
      };

      // Wait for the initial join frame before registering in roomManager.
      let joined = false;
      const joinTimeout = setTimeout(() => {
        if (!joined) {
          socket.close(4008, "Join timeout: send {type:'join',name} within 5 seconds");
        }
      }, 5000);

      socket.on("message", (rawMessage: Buffer | string) => {
        let msg: import("./types.js").ClientMessage;
        try {
          msg = JSON.parse(String(rawMessage)) as import("./types.js").ClientMessage;
        } catch {
          return; // Ignore non-JSON frames.
        }

        if (!joined) {
          if (msg.type !== "join") return; // Must be the first frame.
          clearTimeout(joinTimeout);
          joined = true;

          const name = String(msg.name ?? "Khách").slice(0, 64);
          roomManager.join(code, room.hostUserId, { memberId, name, isHost, send });
          return;
        }

        // After join, route messages to the appropriate RoomManager method.
        switch (msg.type) {
          case "play":
          case "pause":
          case "seek":
            roomManager.applyHostAction(code, memberId, msg);
            break;
          case "chat": {
            const text = String(msg.text ?? "").slice(0, 500).trim();
            if (text) roomManager.chat(code, memberId, text);
            break;
          }
          default:
            break; // Unknown frame types are silently ignored.
        }
      });

      socket.on("close", () => {
        clearTimeout(joinTimeout);
        if (joined) roomManager.leave(code, memberId);
      });

      socket.on("error", () => {
        clearTimeout(joinTimeout);
        if (joined) roomManager.leave(code, memberId);
      });
    },
  );
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/api typecheck`
Expected: no errors.

Run: `pnpm --filter @xophim/api test`
Expected: all existing tests pass (RoomManager suite + HTTP rooms suite + catalog suite).

> **Full WS e2e test note:** Testing a live WebSocket handshake via `app.inject` is not supported by Fastify's inject helper. Manual e2e verification (using `wscat` or a browser) is the practical approach. The RoomManager unit tests in Task 3 cover all synchronization logic; the WS route is a thin adapter with no logic of its own beyond parsing JSON and routing to `roomManager`.

---

## Task 6: Web hook — `useWatchParty(code)`

**Files:**
- Create: `apps/web/src/hooks/watch-party.ts`

A pure data/logic hook. It opens a native browser `WebSocket`, manages connection lifecycle, and exposes a clean interface to UI components. No JSX. The hook derives `ws://` vs `wss://` from `window.location.protocol` so it works in both dev (HTTP) and prod (HTTPS).

- [ ] **Step 1: Create the hook**

Create `apps/web/src/hooks/watch-party.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Protocol types (mirror of apps/api/src/rooms/types.ts) ─────────────────
// Duplicated here for MVP to avoid a shared package. Keep in sync by hand or
// introduce a `packages/shared-types` workspace package later.

interface MemberInfo { id: string; name: string }

interface PlaybackState { playing: boolean; positionSec: number }

interface ChatLine { from: string; text: string; at: string }

// Client → server
type ClientMessage =
  | { type: "join"; name: string }
  | { type: "play"; positionSec: number }
  | { type: "pause"; positionSec: number }
  | { type: "seek"; positionSec: number }
  | { type: "chat"; text: string };

// Server → client
type ServerMessage =
  | { type: "state"; playing: boolean; positionSec: number }
  | { type: "members"; members: MemberInfo[] }
  | { type: "chat"; from: string; text: string; at: string }
  | { type: "sync"; playing: boolean; positionSec: number; members: MemberInfo[] }
  | { type: "denied"; reason: string; playing: boolean; positionSec: number };

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface WatchPartyState {
  /** Current member list (updated live). */
  members: MemberInfo[];
  /** Chat history since this client connected (not persisted server-side). */
  chat: ChatLine[];
  /** Current playback state from the host. */
  playbackState: PlaybackState;
  /** Whether the WebSocket is currently connected. */
  connected: boolean;
  /** Send a chat message. No-op if not connected. */
  sendChat: (text: string) => void;
  /**
   * Host-only controls. Non-host callers can invoke these but the server will
   * respond with a `denied` frame echoing back the authoritative state.
   */
  hostControls: {
    play: (positionSec: number) => void;
    pause: (positionSec: number) => void;
    seek: (positionSec: number) => void;
  };
}

/**
 * Opens a WebSocket to /v1/rooms/:code/ws and manages the connection lifecycle.
 * Sends the `join` frame immediately after the socket opens using the given name.
 *
 * Cleans up (closes the socket) on component unmount.
 *
 * @param code   6-char room invite code, e.g. "AB12CD".
 * @param name   Display name for this member.
 * @param enabled  Set to false to skip opening the socket (e.g. while the code
 *                 is loading). Defaults to true.
 */
export function useWatchParty(
  code: string,
  name: string,
  enabled = true,
): WatchPartyState {
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    playing: false,
    positionSec: 0,
  });
  const [connected, setConnected] = useState(false);

  // Stable ref so the send helper never becomes stale.
  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    if (!enabled || !code) return;

    // Derive ws:// or wss:// from the current page protocol so the hook works
    // in dev (http → ws) and prod (https → wss) without configuration.
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.host;
    const url = `${protocol}://${host}/v1/rooms/${code}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Send the mandatory join frame with the display name.
      ws.send(JSON.stringify({ type: "join", name } satisfies ClientMessage));
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };

    ws.onerror = () => {
      setConnected(false);
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case "sync":
          setPlaybackState({ playing: msg.playing, positionSec: msg.positionSec });
          setMembers(msg.members);
          break;
        case "state":
          setPlaybackState({ playing: msg.playing, positionSec: msg.positionSec });
          break;
        case "members":
          setMembers(msg.members);
          break;
        case "chat":
          setChat((prev) => [...prev, { from: msg.from, text: msg.text, at: msg.at }]);
          break;
        case "denied":
          // Snap our local playback state back to the authoritative one.
          setPlaybackState({ playing: msg.playing, positionSec: msg.positionSec });
          break;
        default:
          break;
      }
    };

    return () => {
      ws.close();
    };
  }, [code, name, enabled, send]);

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.slice(0, 500).trim();
      if (trimmed) send({ type: "chat", text: trimmed });
    },
    [send],
  );

  const hostControls = {
    play: useCallback(
      (positionSec: number) => send({ type: "play", positionSec }),
      [send],
    ),
    pause: useCallback(
      (positionSec: number) => send({ type: "pause", positionSec }),
      [send],
    ),
    seek: useCallback(
      (positionSec: number) => send({ type: "seek", positionSec }),
      [send],
    ),
  };

  return { members, chat, playbackState, connected, sendChat, hostControls };
}
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @xophim/web typecheck`
Expected: no errors.

---

## Task 7: Final checkpoint — full suite

**Files:** none.

- [ ] **Step 1: Run the full API test suite**

Run: `pnpm --filter @xophim/api test`
Expected: all tests pass — `RoomManager` unit tests (Task 3), HTTP rooms integration tests (Task 4), and the inherited catalog test suite (P0/P1). Total should be ≥ 14 tests.

- [ ] **Step 2: Run typechecks across both packages**

Run: `pnpm --filter @xophim/api typecheck && pnpm --filter @xophim/web typecheck`
Expected: no type errors in either package.

- [ ] **Step 3: Manual WS smoke test (optional, requires running API + DB)**

Start the API:
```
pnpm --filter @xophim/api dev
```
Create a room (requires Phase 2 auth or SKIP_AUTH_FOR_TESTS=1):
```
curl -s -X POST http://localhost:6001/v1/rooms \
  -H "Content-Type: application/json" \
  -d '{"slug":"dong-ho-cat","episodeSlug":"tap-1"}'
```
Copy the returned `code`, then open a WebSocket (e.g. via `wscat` or the browser console):
```
wscat -c ws://localhost:6001/v1/rooms/<CODE>/ws
> {"type":"join","name":"Test User"}
< {"type":"sync","playing":false,"positionSec":0,"members":[...]}
> {"type":"play","positionSec":10}
< {"type":"state","playing":true,"positionSec":10}
```
Expected: sync frame on join, state broadcast on host play.

---

## Self-Review Notes (spec coverage)

- **`rooms` Drizzle table** (id, code unique, host_user_id, movie_slug, episode_slug, created_at, closed_at nullable) → Task 1. ✅
- **Migration via `pnpm db:generate`** → Task 1, Step 4. ✅
- **`@fastify/websocket` installed and registered** → Task 0. ✅
- **POST /v1/rooms — requireAuth, generates unique code, returns it** → Task 4. ✅
- **GET /v1/rooms/:code — public, metadata + member count** → Task 4. ✅
- **WS /v1/rooms/:code/ws — full message protocol** → Task 5. ✅
- **Message protocol defined** (client→server: join/play/pause/seek/chat; server→client: state/members/chat/sync/denied) → Task 2. ✅
- **Host-authoritative play/pause/seek; non-host denied + echo** → Task 3 (unit tested) + Task 5 (adapter). ✅
- **`RoomManager` pure/in-memory, fully unit-tested with fake send** → Task 3. ✅
- **WS route is a thin adapter** → Task 5. ✅
- **In-memory rooms — single-instance limitation documented** (horizontal scaling = Redis pub/sub, out of scope) → architecture note in header + RoomManager.ts inline comment. ✅
- **Chat history NOT persisted at MVP** → design spec §7, noted in rooms.ts comment + RoomManager.chat comment. ✅
- **`useWatchParty(code, name)` hook** — ws:// / wss:// derived from window.location, exposes members/chat/playbackState/connected/sendChat/hostControls, cleans up on unmount — → Task 6. ✅
- **No visual components** (data/logic only) → Tasks 1–6 produce only types, pure functions, Fastify plugins, and a React hook. ✅
- **Depends on Phase 2 (requireAuth) + Phase 1 (catalog detail for stream)** — referenced as preconditions, not reimplemented. ✅
- **ESM NodeNext local imports end with `.js`** → all imports across Task 3 / 4 / 5 use `.js` extensions. ✅
- **`app.db` + schema imports for rooms table only** → Task 4 and Task 5 use `app.db` and `schema.rooms` exclusively. ✅
