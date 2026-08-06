import { describe, expect, it } from "vitest";
import { shouldOverwriteProgress } from "../src/auth/service.js";

describe("shouldOverwriteProgress", () => {
  it("returns true when there is no existing row", () => {
    expect(shouldOverwriteProgress(null, new Date("2026-01-02"))).toBe(true);
  });

  it("returns true when the incoming updated_at is newer than the existing row", () => {
    const existing = new Date("2026-01-01T10:00:00Z");
    const incoming = new Date("2026-01-01T11:00:00Z");
    expect(shouldOverwriteProgress(existing, incoming)).toBe(true);
  });

  it("returns false when the existing row is newer than the incoming", () => {
    const existing = new Date("2026-01-01T12:00:00Z");
    const incoming = new Date("2026-01-01T11:00:00Z");
    expect(shouldOverwriteProgress(existing, incoming)).toBe(false);
  });

  it("returns false when timestamps are equal (existing wins as tie-break)", () => {
    const ts = new Date("2026-01-01T10:00:00Z");
    expect(shouldOverwriteProgress(ts, ts)).toBe(false);
  });
});
