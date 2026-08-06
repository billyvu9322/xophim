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
let user1Sid: string;
let user2Sid: string;
let adminSid: string;
let user1Id: string;
let c1Id: string;

beforeAll(async () => {
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await memDb.delete(schema.comments);
  await memDb.delete(schema.commentLikes);
  await memDb.delete(schema.ratings);
  await memDb.delete(schema.reports);
  await memDb.delete(schema.sessions);
  await memDb.delete(schema.users);

  const [u1] = await memDb
    .insert(schema.users)
    .values({ email: "u1@x.com", role: "user", displayName: "U1" })
    .returning();
  const [u2] = await memDb
    .insert(schema.users)
    .values({ email: "u2@x.com", role: "user", displayName: "U2" })
    .returning();
  const [adm] = await memDb
    .insert(schema.users)
    .values({ email: "admin@x.com", role: "admin", displayName: "Admin" })
    .returning();
  user1Id = u1!.id;
  user1Sid = await createSession(memDb, { userId: u1!.id, ttlDays: 7 });
  user2Sid = await createSession(memDb, { userId: u2!.id, ttlDays: 7 });
  adminSid = await createSession(memDb, { userId: adm!.id, ttlDays: 7 });

  const [c1] = await memDb
    .insert(schema.comments)
    .values({ userId: user1Id, movieSlug: "test-movie", body: "Great movie!" })
    .returning();
  c1Id = c1!.id;
});

describe("GET /v1/movies/:slug/comments (public)", () => {
  it("returns 200 with items + pagination for unauthenticated callers", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/movies/test-movie/comments" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.pagination).toHaveProperty("totalPages");
  });

  it("returns 400 for page=0", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/movies/test-movie/comments?page=0" });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/movies/:slug/comments (requireAuth)", () => {
  it("401 without a session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/movies/test-movie/comments",
      payload: { body: "Hi" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("201 with a valid session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/movies/test-movie/comments",
      headers: { cookie: `sid=${user2Sid}` },
      payload: { body: "Nice film!" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("400 for an empty body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/movies/test-movie/comments",
      headers: { cookie: `sid=${user1Sid}` },
      payload: { body: "" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /v1/comments/:id (owner only)", () => {
  it("401 unauthenticated", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/comments/${c1Id}`,
      payload: { body: "Edited" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("403 when a non-owner edits", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/comments/${c1Id}`,
      headers: { cookie: `sid=${user2Sid}` },
      payload: { body: "Hack!" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("200 when the owner edits", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/comments/${c1Id}`,
      headers: { cookie: `sid=${user1Sid}` },
      payload: { body: "Edited properly" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().body).toBe("Edited properly");
  });
});

describe("DELETE /v1/comments/:id (owner OR admin, soft delete)", () => {
  it("403 when a non-owner non-admin deletes", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/v1/comments/${c1Id}`,
      headers: { cookie: `sid=${user2Sid}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("204 when admin deletes; the comment then shows as [đã xóa]", async () => {
    const del = await app.inject({
      method: "DELETE",
      url: `/v1/comments/${c1Id}`,
      headers: { cookie: `sid=${adminSid}` },
    });
    expect(del.statusCode).toBe(204);

    const list = await app.inject({ method: "GET", url: "/v1/movies/test-movie/comments" });
    expect(list.json().items[0].isDeleted).toBe(true);
    expect(list.json().items[0].body).toBe("[đã xóa]");
  });
});

describe("PUT /v1/comments/:id/like (toggle)", () => {
  it("401 unauthenticated", async () => {
    const res = await app.inject({ method: "PUT", url: `/v1/comments/${c1Id}/like` });
    expect(res.statusCode).toBe(401);
  });

  it("toggles like on then off", async () => {
    const on = await app.inject({
      method: "PUT",
      url: `/v1/comments/${c1Id}/like`,
      headers: { cookie: `sid=${user2Sid}` },
    });
    expect(on.json().liked).toBe(true);
    const off = await app.inject({
      method: "PUT",
      url: `/v1/comments/${c1Id}/like`,
      headers: { cookie: `sid=${user2Sid}` },
    });
    expect(off.json().liked).toBe(false);
  });
});

describe("ratings", () => {
  it("GET rating is public and returns avg+count", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/movies/test-movie/rating" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("avg");
    expect(res.json()).toHaveProperty("count");
  });

  it("PUT rating 401 unauthenticated", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/movies/test-movie/rating",
      payload: { score: 4 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("PUT rating upserts and returns mine", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/movies/test-movie/rating",
      headers: { cookie: `sid=${user1Sid}` },
      payload: { score: 5 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().mine).toBe(5);
    expect(res.json().count).toBe(1);
  });

  it("PUT rating 400 for out-of-range score", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/movies/test-movie/rating",
      headers: { cookie: `sid=${user1Sid}` },
      payload: { score: 6 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/reports (public)", () => {
  it("201 for a guest report", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/reports",
      payload: { slug: "test-movie", reason: "loi-phu-de" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toHaveProperty("id");
  });

  it("201 for an authenticated report", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/reports",
      headers: { cookie: `sid=${user1Sid}` },
      payload: { slug: "test-movie", reason: "khong-phat", note: "Tập 5 không phát" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("400 for an invalid reason", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/reports",
      payload: { slug: "test-movie", reason: "not-valid" },
    });
    expect(res.statusCode).toBe(400);
  });
});
