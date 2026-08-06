import argon2 from "argon2";

// argon2id is the recommended variant (hybrid of argon2i and argon2d).
// The `argon2` package defaults to argon2id when using argon2.hash().

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, { type: argon2.argon2id });
}

export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  // argon2.verify throws on a malformed/foreign hash string. Treat any such
  // failure as "not a match" so a bad stored hash can't crash the login path.
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}
