interface Entry<T> {
  value: T;
  freshUntil: number;
}

interface Options {
  now?: () => number;
  maxEntries?: number;
}

// TTL cache that retains expired values so callers can fall back to stale data
// when the upstream fails (stale-if-error). Insertion-ordered eviction (LRU-ish
// for a proxy where every key is read soon after write).
export class TtlCache<T> {
  private readonly store = new Map<string, Entry<T>>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(opts: Options = {}) {
    this.now = opts.now ?? Date.now;
    this.maxEntries = opts.maxEntries ?? 500;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.store.delete(key);
    this.store.set(key, { value, freshUntil: this.now() + ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  getFresh(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    return this.now() <= entry.freshUntil ? entry.value : undefined;
  }

  getStale(key: string): T | undefined {
    return this.store.get(key)?.value;
  }
}
