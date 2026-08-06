import { describe, expect, it } from "vitest";
import {
  buildAuthUrl,
  generatePkce,
  generateState,
} from "../src/auth/oauth-google.js";

describe("Google OAuth helpers", () => {
  it("generateState returns a 32-byte hex string", () => {
    const s = generateState();
    expect(s).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generateState returns different values on each call", () => {
    expect(generateState()).not.toBe(generateState());
  });

  it("generatePkce returns verifier and challenge", () => {
    const { verifier, challenge } = generatePkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("buildAuthUrl produces a valid Google authorization URL with PKCE params", () => {
    const url = buildAuthUrl({
      clientId: "test-client-id",
      redirectUri: "https://api.example.com/v1/auth/google/callback",
      state: "abc123",
      codeChallenge: "challenge_value",
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("accounts.google.com");
    expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
    expect(parsed.searchParams.get("state")).toBe("abc123");
    expect(parsed.searchParams.get("code_challenge")).toBe("challenge_value");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://api.example.com/v1/auth/google/callback",
    );
    expect(parsed.searchParams.get("response_type")).toBe("code");
    const scopes = (parsed.searchParams.get("scope") ?? "").split(" ");
    expect(scopes).toContain("openid");
    expect(scopes).toContain("email");
  });
});
