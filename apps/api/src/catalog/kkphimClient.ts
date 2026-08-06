import type { ZodTypeAny, z } from "zod";
import { TtlCache } from "./cache.js";

export class UpstreamError extends Error {
  statusCode = 502;
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

interface Logger {
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

interface Options {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  logger?: Logger;
  timeoutMs?: number;
}

// The single gateway to KKPhim. Caches raw parsed JSON per URL; on any upstream
// or validation failure, serves stale cache if present (stale-if-error), else 502.
export class KkphimClient {
  private readonly cache: TtlCache<unknown>;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Logger;
  private readonly timeoutMs: number;

  constructor(opts: Options) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.logger = opts.logger ?? { warn: console.warn, error: console.error };
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    // `now` is accepted for cache determinism in tests.
    this.cache = new TtlCache<unknown>(opts.now ? { now: opts.now } : {});
  }

  async get<S extends ZodTypeAny>(
    path: string,
    schema: S,
    ttlMs: number,
  ): Promise<z.infer<S>> {
    const key = path;
    const fresh = this.cache.getFresh(key);
    if (fresh !== undefined) return fresh as z.infer<S>;

    try {
      const json = await this.fetchWithRetry(path);
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        this.logger.warn(`KKPhim schema drift at ${path}: ${parsed.error.message}`);
        throw new Error("schema validation failed");
      }
      this.cache.set(key, parsed.data, ttlMs);
      return parsed.data as z.infer<S>;
    } catch (err) {
      const stale = this.cache.getStale(key);
      if (stale !== undefined) {
        this.logger.warn(`KKPhim failed at ${path}, serving stale cache`);
        return stale as z.infer<S>;
      }
      this.logger.error(`KKPhim failed at ${path}: ${(err as Error).message}`);
      throw new UpstreamError(`Upstream KKPhim request failed: ${path}`);
    }
  }

  private async fetchWithRetry(path: string): Promise<unknown> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.fetchJson(path);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  private async fetchJson(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
