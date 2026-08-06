import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password.js";

describe("password helpers", () => {
  it("hashes a password and verifies it correctly", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    const ok = await verifyPassword("correct-horse-battery-staple", hash);
    expect(ok).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("secret");
    const ok = await verifyPassword("wrong", hash);
    expect(ok).toBe(false);
  });

  it("produces different hashes for the same password (salt)", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });

  it("returns false when verifying a malformed hash", async () => {
    const ok = await verifyPassword("pw", "not-a-valid-argon2-hash");
    expect(ok).toBe(false);
  });
});
