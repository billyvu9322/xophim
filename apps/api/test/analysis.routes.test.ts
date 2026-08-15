import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toAnalysisCount } from "../src/analysis/routes.js";
import * as schema from "../src/db/schema/index.js";

vi.mock("../src/db/index.js", async () => {
  const { buildMemDb } = await import("./helpers/memdb.js");
  const db = await buildMemDb();
  return { db, pingDb: async () => {} };
});

const { db: memDb } = await import("../src/db/index.js");

let app: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>;

beforeAll(async () => {
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
});

beforeEach(async () => {
  await memDb.delete(schema.watchProgress);
  await memDb.delete(schema.watchlist);
  await memDb.delete(schema.sessions);
  await memDb.delete(schema.users);
});

describe("GET /v1/analysis/overview", () => {
  it("coerces database aggregate counts returned as strings", () => {
    expect(toAnalysisCount("1")).toBe(1);
  });

  it("rejects requests without the analysis password", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/analysis/overview" });

    expect(res.statusCode).toBe(401);
  });

  it("returns user and watch activity metrics with the analysis password", async () => {
    const [user] = await memDb
      .insert(schema.users)
      .values({
        username: "alice",
        email: "alice@example.com",
        displayName: "Alice",
      })
      .returning();

    await memDb.insert(schema.sessions).values({
      id: "a".repeat(64),
      userId: user!.id,
      expiresAt: new Date(Date.now() + 60_000),
      userAgent: "vitest",
      ip: "127.0.0.1",
    });

    await memDb.insert(schema.watchlist).values({
      user_id: user!.id,
      movie_slug: "movie-a",
      movie_snapshot: { name: "Movie A", posterUrl: "/a.jpg", type: "series", year: 2026 },
    });

    await memDb.insert(schema.watchProgress).values({
      user_id: user!.id,
      movie_slug: "movie-a",
      episode_slug: "tap-1",
      server_name: "Vietsub",
      position_sec: 120,
      duration_sec: 1800,
      movie_snapshot: { name: "Movie A", posterUrl: "/a.jpg", type: "series", year: 2026 },
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/analysis/overview",
      headers: { "x-analysis-password": "binhhp20" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary.totalUsers).toBe(1);
    expect(body.summary.activeSessions).toBe(1);
    expect(body.summary.usersWithHistory).toBe(1);
    expect(body.users[0].email).toBe("alice@example.com");
    expect(body.users[0].watchProgressCount).toBe(1);
    expect(body.users[0].watchlistCount).toBe(1);
    expect(body.topMovies[0].name).toBe("Movie A");
    expect(body.recentActivity[0].movieName).toBe("Movie A");
  });
});
