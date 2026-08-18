import { eq, or } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { users } from "../db/schema/index.js";
import { hashPassword } from "./password.js";

const ADMIN_USERNAME = "binhhp20";
const ADMIN_PASSWORD = "binhhp20";
const ADMIN_EMAIL = "binhhp20@xophim.local";

export async function seedAdminUser(db: Database): Promise<void> {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.username, ADMIN_USERNAME), eq(users.email, ADMIN_EMAIL)))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        username: ADMIN_USERNAME,
        email: ADMIN_EMAIL,
        passwordHash,
        displayName: ADMIN_USERNAME,
        role: "admin",
      })
      .where(eq(users.id, existing.id));
    return;
  }

  await db.insert(users).values({
    username: ADMIN_USERNAME,
    email: ADMIN_EMAIL,
    passwordHash,
    displayName: ADMIN_USERNAME,
    role: "admin",
  });
}
