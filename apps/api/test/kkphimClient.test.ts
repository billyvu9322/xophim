import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { KkphimClient } from "../src/catalog/kkphimClient.js";

const schema = z.object({ value: z.number() });

function makeClient(fetchImpl: typeof fetch, now = () => 0) {
  return new KkphimClient({
    baseUrl: "https://kk.test",
    fetchImpl,
    now,
    logger: { warn: () => {}, error: () => {} },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("KkphimClient.get", () => {
  it("fetches, validates, and returns the parsed value", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ value: 1 }), { status: 200 }),
    );
    const c = makeClient(fetchImpl as unknown as typeof fetch);
    const out = await c.get("/x", schema, 1000);
    expect(out).toEqual({ value: 1 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("serves a fresh cached value without a second fetch", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ value: 2 }), { status: 200 }),
    );
    const c = makeClient(fetchImpl as unknown as typeof fetch);
    await c.get("/x", schema, 1000);
    const out = await c.get("/x", schema, 1000);
    expect(out).toEqual({ value: 2 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("falls back to stale cache when the upstream later fails", async () => {
    let now = 0;
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) return new Response(JSON.stringify({ value: 3 }), { status: 200 });
      throw new Error("network down");
    });
    const c = makeClient(fetchImpl as unknown as typeof fetch, () => now);
    await c.get("/x", schema, 1000); // primes cache
    now = 10_000; // expire it
    const out = await c.get("/x", schema, 1000);
    expect(out).toEqual({ value: 3 }); // stale served
  });

  it("throws UpstreamError when it fails with no cache", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));
    const c = makeClient(fetchImpl as unknown as typeof fetch);
    await expect(c.get("/x", schema, 1000)).rejects.toThrow(/upstream/i);
  });
});
