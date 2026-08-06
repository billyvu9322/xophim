import { describe, expect, it } from "vitest";
import { TtlCache } from "../src/catalog/cache.js";

describe("TtlCache", () => {
  it("returns a fresh value before TTL expires", () => {
    let now = 1000;
    const c = new TtlCache<string>({ now: () => now });
    c.set("k", "v", 500);
    now = 1400;
    expect(c.getFresh("k")).toBe("v");
  });

  it("treats a value as not-fresh after TTL", () => {
    let now = 1000;
    const c = new TtlCache<string>({ now: () => now });
    c.set("k", "v", 500);
    now = 1600;
    expect(c.getFresh("k")).toBeUndefined();
  });

  it("still exposes the stale value after expiry via getStale", () => {
    let now = 1000;
    const c = new TtlCache<string>({ now: () => now });
    c.set("k", "v", 500);
    now = 5000;
    expect(c.getFresh("k")).toBeUndefined();
    expect(c.getStale("k")).toBe("v");
  });

  it("evicts the oldest entry past maxEntries", () => {
    const c = new TtlCache<string>({ now: () => 0, maxEntries: 2 });
    c.set("a", "1", 100);
    c.set("b", "2", 100);
    c.set("c", "3", 100);
    expect(c.getStale("a")).toBeUndefined();
    expect(c.getStale("b")).toBe("2");
    expect(c.getStale("c")).toBe("3");
  });
});
