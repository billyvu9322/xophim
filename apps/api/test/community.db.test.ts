import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../src/db/schema/index.js";
import { computeRating } from "../src/community/service.js";
import { readOptionalUser } from "../src/auth/optional-auth.js";
import { createSession } from "../src/auth/session.js";
import { buildMemDb } from "./helpers/memdb.js";

describe("computeRating (pglite)", () => {
  let db: Awaited<ReturnType<typeof buildMemDb>>;
  let u1: string;
  let u2: string;

  beforeEach(async () => {
    db = await buildMemDb();
    const [a] = await db
      .insert(schema.users)
      .values({ email: "a@x.com", role: "user", displayName: "A" })
      .returning();
    const [b] = await db
      .insert(schema.users)
      .values({ email: "b@x.com", role: "user", displayName: "B" })
      .returning();
    u1 = a!.id;
    u2 = b!.id;
  });

  it("returns null avg + 0 count when there are no ratings", async () => {
    const r = await computeRating(db, "no-ratings", null);
    expect(r.avg).toBeNull();
    expect(r.count).toBe(0);
    expect(r.mine).toBeNull();
  });

  it("aggregates avg + count across users", async () => {
    await db.insert(schema.ratings).values({ userId: u1, movieSlug: "m", score: 4 });
    await db.insert(schema.ratings).values({ userId: u2, movieSlug: "m", score: 2 });
    const r = await computeRating(db, "m", null);
    expect(r.avg).toBeCloseTo(3);
    expect(r.count).toBe(2);
  });

  it("includes the caller's own score in `mine`", async () => {
    await db.insert(schema.ratings).values({ userId: u1, movieSlug: "m", score: 5 });
    const r = await computeRating(db, "m", u1);
    expect(r.mine).toBe(5);
  });
});

describe("readOptionalUser (pglite)", () => {
  let db: Awaited<ReturnType<typeof buildMemDb>>;
  let userId: string;
  let sid: string;

  beforeEach(async () => {
    db = await buildMemDb();
    const [u] = await db
      .insert(schema.users)
      .values({ email: "c@x.com", role: "user", displayName: "C" })
      .returning();
    userId = u!.id;
    sid = await createSession(db, { userId, ttlDays: 7 });
  });

  it("returns null when no sid cookie", async () => {
    expect(await readOptionalUser(db, undefined)).toBeNull();
  });

  it("returns null for an unknown sid", async () => {
    expect(await readOptionalUser(db, "deadbeef".repeat(8))).toBeNull();
  });

  it("returns the user for a valid sid", async () => {
    const u = await readOptionalUser(db, sid);
    expect(u?.id).toBe(userId);
    expect(u?.email).toBe("c@x.com");
  });
});
