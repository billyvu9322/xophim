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
let adminSid: string;
let userSid: string;
let adminId: string;
let publishedId: string;

beforeAll(async () => {
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await memDb.delete(schema.collectionItems);
  await memDb.delete(schema.collections);
  await memDb.delete(schema.sessions);
  await memDb.delete(schema.users);

  const [admin] = await memDb
    .insert(schema.users)
    .values({ email: "admin@x.com", role: "admin", displayName: "Admin" })
    .returning();
  const [user] = await memDb
    .insert(schema.users)
    .values({ email: "user@x.com", role: "user", displayName: "User" })
    .returning();
  adminId = admin!.id;
  adminSid = await createSession(memDb, { userId: admin!.id, ttlDays: 7 });
  userSid = await createSession(memDb, { userId: user!.id, ttlDays: 7 });

  const [pub] = await memDb
    .insert(schema.collections)
    .values({
      slug: "phim-hanh-dong-hay",
      title: "Phim Hành Động Hay",
      description: "Đỉnh cao",
      cover_url: "https://cdn/c.webp",
      is_published: true,
      sort: 1,
      created_by: adminId,
    })
    .returning();
  publishedId = pub!.id;
  await memDb.insert(schema.collectionItems).values({
    collection_id: publishedId,
    movie_slug: "dong-ho-cat",
    sort: 0,
    movie_snapshot: {
      name: "Đồng Hồ Cát",
      posterUrl: "https://cdn/p.webp",
      thumbUrl: "https://cdn/t.webp",
      type: "single",
      year: 2024,
      quality: "FHD",
    },
  });
  await memDb.insert(schema.collections).values({
    slug: "phim-chua-duyet",
    title: "Chưa Duyệt",
    is_published: false,
    sort: 99,
    created_by: adminId,
  });
});

describe("GET /v1/collections (public)", () => {
  it("returns only published collections", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/collections" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].slug).toBe("phim-hanh-dong-hay");
  });
});

describe("GET /v1/collections/:slug (public)", () => {
  it("returns the collection with enriched items", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/collections/phim-hanh-dong-hay" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].movieSlug).toBe("dong-ho-cat");
    expect(body.items[0].snapshot.name).toBe("Đồng Hồ Cát");
  });

  it("404 for an unpublished collection", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/collections/phim-chua-duyet" });
    expect(res.statusCode).toBe(404);
  });

  it("404 for a missing slug", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/collections/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /v1/collections (admin guard)", () => {
  const body = {
    slug: "phim-tinh-cam-moi",
    title: "Phim Tình Cảm Mới",
    description: "Chọn lọc",
    cover_url: "https://cdn/tc.webp",
    is_published: false,
    sort: 5,
  };

  it("401 without a session", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/collections", payload: body });
    expect(res.statusCode).toBe(401);
  });

  it("403 for a non-admin session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/collections",
      headers: { cookie: `sid=${userSid}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });

  it("201 for an admin session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/collections",
      headers: { cookie: `sid=${adminSid}` },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    expect(typeof res.json().id).toBe("string");
  });

  it("409 when the slug already exists", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/collections",
      headers: { cookie: `sid=${adminSid}` },
      payload: { ...body, slug: "phim-hanh-dong-hay" },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("admin item management", () => {
  it("upserts then removes an item", async () => {
    const add = await app.inject({
      method: "PUT",
      url: `/v1/collections/${publishedId}/items/vo-dieu-ky-duyen`,
      headers: { cookie: `sid=${adminSid}` },
      payload: {
        snapshot: {
          name: "Võ Điệu Kỳ Duyên",
          posterUrl: "https://cdn/v.webp",
          thumbUrl: "https://cdn/vt.webp",
          type: "series",
          year: 2025,
          quality: "HD",
        },
        sort: 1,
      },
    });
    expect(add.statusCode).toBe(200);
    expect(add.json()).toEqual({ ok: true });

    const del = await app.inject({
      method: "DELETE",
      url: `/v1/collections/${publishedId}/items/vo-dieu-ky-duyen`,
      headers: { cookie: `sid=${adminSid}` },
    });
    expect(del.statusCode).toBe(204);
  });

  it("404 when removing a non-existent item", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/v1/collections/${publishedId}/items/nope`,
      headers: { cookie: `sid=${adminSid}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
