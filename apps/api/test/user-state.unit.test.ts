import { describe, expect, it } from "vitest";
import { shouldOverwriteProgress, sortByUpdatedAt } from "../src/user-state/logic.js";

describe("shouldOverwriteProgress", () => {
  it("returns true when incoming is newer", () => {
    const stored = new Date("2026-01-01T10:00:00Z");
    const incoming = new Date("2026-01-01T11:00:00Z");
    expect(shouldOverwriteProgress(stored, incoming)).toBe(true);
  });

  it("returns false when incoming is the same timestamp", () => {
    const t = new Date("2026-01-01T10:00:00Z");
    expect(shouldOverwriteProgress(t, t)).toBe(false);
  });

  it("returns false when incoming is older", () => {
    const stored = new Date("2026-01-01T12:00:00Z");
    const incoming = new Date("2026-01-01T10:00:00Z");
    expect(shouldOverwriteProgress(stored, incoming)).toBe(false);
  });

  it("returns true when stored is null (first write)", () => {
    const incoming = new Date("2026-01-01T10:00:00Z");
    expect(shouldOverwriteProgress(null, incoming)).toBe(true);
  });
});

describe("sortByUpdatedAt", () => {
  it("sorts rows descending by updated_at", () => {
    const rows = [
      { id: "a", updated_at: new Date("2026-01-01T08:00:00Z") },
      { id: "b", updated_at: new Date("2026-01-01T12:00:00Z") },
      { id: "c", updated_at: new Date("2026-01-01T10:00:00Z") },
    ];
    const sorted = sortByUpdatedAt(rows);
    expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("handles an empty array", () => {
    expect(sortByUpdatedAt([])).toEqual([]);
  });

  it("is stable for equal timestamps", () => {
    const t = new Date("2026-01-01T10:00:00Z");
    const rows = [
      { id: "x", updated_at: t },
      { id: "y", updated_at: t },
    ];
    expect(sortByUpdatedAt(rows).map((r) => r.id)).toEqual(["x", "y"]);
  });
});
