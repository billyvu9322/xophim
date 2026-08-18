import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../src/db/schema/index.js";
import { loginUser } from "../src/auth/service.js";
import { seedAdminUser } from "../src/auth/admin-seed.js";

vi.mock("../src/db/index.js", async () => {
  const { buildMemDb } = await import("./helpers/memdb.js");
  const db = await buildMemDb();
  return { db, pingDb: async () => {} };
});

const { db: memDb } = await import("../src/db/index.js");

beforeEach(async () => {
  await memDb.delete(schema.sessions);
  await memDb.delete(schema.users);
});

describe("seedAdminUser", () => {
  it("creates an admin account that can log in", async () => {
    await seedAdminUser(memDb);

    const user = await loginUser(memDb, { usernameOrEmail: "binhhp20", password: "binhhp20" });

    expect(user.username).toBe("binhhp20");
    expect(user.role).toBe("admin");
  });

  it("updates an existing seeded account without creating duplicates", async () => {
    await seedAdminUser(memDb);
    await seedAdminUser(memDb);

    const rows = await memDb.select().from(schema.users);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("admin");
  });
});
