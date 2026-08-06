import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../src/db/schema/index.js";

vi.mock("../src/db/index.js", async () => {
  const { buildMemDb } = await import("./helpers/memdb.js");
  const db = await buildMemDb();
  return { db, pingDb: async () => {} };
});

const { db: memDb } = await import("../src/db/index.js");
const { createSession } = await import("../src/auth/session.js");

let app: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>;
let sid: string;

beforeAll(async () => {
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await memDb.delete(schema.rooms);
  await memDb.delete(schema.sessions);
  await memDb.delete(schema.users);
  const [u] = await memDb
    .insert(schema.users)
    .values({ email: "host@x.com", role: "user", displayName: "Host" })
    .returning();
  sid = await createSession(memDb, { userId: u!.id, ttlDays: 7 });
});

describe("POST /v1/rooms", () => {
  it("401 without a session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      payload: { slug: "dong-ho-cat", episodeSlug: "full" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("201 with a session; returns a 6-char code + metadata", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: { cookie: `sid=${sid}` },
      payload: { slug: "dong-ho-cat", episodeSlug: "full" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.code).toHaveLength(6);
    expect(body.movieSlug).toBe("dong-ho-cat");
  });
});

describe("GET /v1/rooms/:code", () => {
  it("200 with metadata + memberCount 0 for a known room", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: { cookie: `sid=${sid}` },
      payload: { slug: "dong-ho-cat", episodeSlug: "full" },
    });
    const { code } = create.json();
    const res = await app.inject({ method: "GET", url: `/v1/rooms/${code}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().memberCount).toBe(0);
    expect(res.json().closedAt).toBeNull();
  });

  it("404 for an unknown 6-char code", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/rooms/ZZZZZZ" });
    expect(res.statusCode).toBe(404);
  });
});
