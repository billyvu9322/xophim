import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../src/db/schema/index.js";

// Swap the db singleton for a pglite instance before any module loads it.
vi.mock("../src/db/index.js", async () => {
  const { buildMemDb } = await import("./helpers/memdb.js");
  const db = await buildMemDb();
  return { db, pingDb: async () => {} };
});

const { db: memDb } = await import("../src/db/index.js");
const { createSession } = await import("../src/auth/session.js");

let app: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>;
let sid: string;
const SNAPSHOT = { name: "Đồng Hồ Cát", posterUrl: "https://phimimg.com/p.webp", type: "single", year: 2024 };

beforeAll(async () => {
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

// Fresh user + session (and clean tables) before each test.
beforeEach(async () => {
  await memDb.delete(schema.watchProgress);
  await memDb.delete(schema.watchlist);
  await memDb.delete(schema.sessions);
  await memDb.delete(schema.users);
  const [user] = await memDb
    .insert(schema.users)
    .values({ email: "u@example.com", role: "user", displayName: "U" })
    .returning();
  sid = await createSession(memDb, { userId: user!.id, ttlDays: 7 });
});

const authCookie = () => ({ cookie: `sid=${sid}` });

describe("requireAuth guard on /v1/me/*", () => {
  it("GET /v1/me/watchlist → 401 without a session cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/watchlist" });
    expect(res.statusCode).toBe(401);
  });

  it("PUT /v1/me/progress → 401 without a session cookie", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/me/progress",
      payload: { slug: "x", episodeSlug: "full", server: "S", positionSec: 1, snapshot: SNAPSHOT },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("watchlist", () => {
  it("adds, lists, and removes a movie", async () => {
    const add = await app.inject({
      method: "PUT",
      url: "/v1/me/watchlist/dong-ho-cat",
      headers: authCookie(),
      payload: { movie_snapshot: SNAPSHOT },
    });
    expect(add.statusCode).toBe(200);
    expect(add.json().movie_slug).toBe("dong-ho-cat");

    const list = await app.inject({ method: "GET", url: "/v1/me/watchlist", headers: authCookie() });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);

    const del = await app.inject({
      method: "DELETE",
      url: "/v1/me/watchlist/dong-ho-cat",
      headers: authCookie(),
    });
    expect(del.statusCode).toBe(200);

    const list2 = await app.inject({ method: "GET", url: "/v1/me/watchlist", headers: authCookie() });
    expect(list2.json().items).toHaveLength(0);
  });

  it("is idempotent on repeated add (same slug)", async () => {
    await app.inject({
      method: "PUT",
      url: "/v1/me/watchlist/x",
      headers: authCookie(),
      payload: { movie_snapshot: SNAPSHOT },
    });
    await app.inject({
      method: "PUT",
      url: "/v1/me/watchlist/x",
      headers: authCookie(),
      payload: { movie_snapshot: SNAPSHOT },
    });
    const list = await app.inject({ method: "GET", url: "/v1/me/watchlist", headers: authCookie() });
    expect(list.json().items).toHaveLength(1);
  });
});

describe("progress / history", () => {
  it("upserts progress and lists it in history", async () => {
    const save = await app.inject({
      method: "PUT",
      url: "/v1/me/progress",
      headers: authCookie(),
      payload: {
        slug: "dong-ho-cat",
        episodeSlug: "full",
        server: "Vietsub",
        positionSec: 120,
        durationSec: 6600,
        snapshot: SNAPSHOT,
      },
    });
    expect(save.statusCode).toBe(200);
    expect(save.json().position_sec).toBe(120);

    // Upsert same key with a larger position → updates the same row.
    const save2 = await app.inject({
      method: "PUT",
      url: "/v1/me/progress",
      headers: authCookie(),
      payload: {
        slug: "dong-ho-cat",
        episodeSlug: "full",
        server: "Vietsub",
        positionSec: 300,
        durationSec: 6600,
        snapshot: SNAPSHOT,
      },
    });
    expect(save2.statusCode).toBe(200);
    expect(save2.json().position_sec).toBe(300);

    const hist = await app.inject({ method: "GET", url: "/v1/me/history", headers: authCookie() });
    expect(hist.statusCode).toBe(200);
    expect(hist.json().items).toHaveLength(1); // upsert, not a second row
    expect(hist.json().items[0].position_sec).toBe(300);
  });

  it("validates the progress body (400 on missing fields)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/me/progress",
      headers: authCookie(),
      payload: { slug: "x" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("deletes history for a movie", async () => {
    await app.inject({
      method: "PUT",
      url: "/v1/me/progress",
      headers: authCookie(),
      payload: { slug: "m", episodeSlug: "full", server: "S", positionSec: 10, snapshot: SNAPSHOT },
    });
    const del = await app.inject({ method: "DELETE", url: "/v1/me/history/m", headers: authCookie() });
    expect(del.statusCode).toBe(200);
    const hist = await app.inject({ method: "GET", url: "/v1/me/history", headers: authCookie() });
    expect(hist.json().items).toHaveLength(0);
  });
});
