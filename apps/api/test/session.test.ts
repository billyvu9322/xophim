import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../src/db/schema/index.js";
import { createSession, deleteSession, lookupSession } from "../src/auth/session.js";
import { buildMemDb } from "./helpers/memdb.js";

describe("session helpers", () => {
  let db: Awaited<ReturnType<typeof buildMemDb>>;
  let userId: string;

  beforeEach(async () => {
    db = await buildMemDb();
    const [user] = await db
      .insert(schema.users)
      .values({ email: "test@example.com", role: "user", displayName: "Test" })
      .returning();
    userId = user!.id;
  });

  it("createSession inserts a row and returns the session id (64 hex chars)", async () => {
    const sid = await createSession(db, { userId, ttlDays: 7 });
    expect(sid).toMatch(/^[0-9a-f]{64}$/);
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
