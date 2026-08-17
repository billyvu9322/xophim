import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";

import { env } from "../config/env.js";
import { catalogService } from "../catalog/service.js";
import { buildMeta } from "./build-meta.js";
import { injectSeo, escapeHtml } from "./head.js";

const SITE = env.SITE_URL;

// Paths the SPA fallback must NOT swallow (handled elsewhere / real 404s).
function isAppAsset(url: string): boolean {
  return (
    url.startsWith("/v1") ||
    url.startsWith("/assets/") ||
    url.startsWith("/robots.txt") ||
    url.startsWith("/sitemap.xml")
  );
}

function urlEntry(path: string, changefreq: string, priority: string): string {
  return `  <url><loc>${escapeHtml(`${SITE}${path}`)}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

// Recent-movie sitemap: the static landing pages plus the freshest catalog slugs.
// Not the full (huge) catalog — a bounded, frequently-refreshed set is what a
// crawler needs to discover new content; deep pages are reached via internal links.
async function buildSitemap(): Promise<string> {
  const staticPaths = [
    "/",
    "/filter",
    "/chu-de",
    "/list/phim-moi",
    "/list/phim-bo",
    "/list/phim-le",
    "/list/hoat-hinh",
    "/list/tv-shows",
    "/quoc-gia/han-quoc",
    "/quoc-gia/trung-quoc",
  ];

  const slugs = new Set<string>();
  try {
    const pools = await Promise.all([
      catalogService.latest(1),
      catalogService.list("phim-bo", { limit: 64 }),
      catalogService.list("phim-le", { limit: 64 }),
      catalogService.list("hoat-hinh", { limit: 64 }),
    ]);
    for (const pool of pools)
      for (const m of pool.items) if (m.slug) slugs.add(m.slug);
  } catch {
    // Upstream down — still emit the static landing pages.
  }

  const urls = [
    ...staticPaths.map((p) =>
      urlEntry(p, p === "/" ? "hourly" : "daily", p === "/" ? "1.0" : "0.8"),
    ),
    ...[...slugs].map((s) => urlEntry(`/xem/${encodeURIComponent(s)}`, "weekly", "0.6")),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
}

const ROBOTS = `User-agent: *
Allow: /
Disallow: /dang-nhap
Disallow: /dang-ky
Disallow: /tai-khoan
Disallow: /danh-sach
Disallow: /lich-su
Disallow: /xem-chung
Disallow: /dashboard
Disallow: /search

Sitemap: ${SITE}/sitemap.xml
`;

// Registers everything needed to serve the built SPA as an SEO-friendly site:
// static assets, robots.txt, a dynamic sitemap.xml, and a fallback handler that
// injects per-route <head> metadata into index.html for crawlers. Only active
// when WEB_STATIC_DIR points at a real build (the single-image prod deploy).
export async function registerSpa(app: FastifyInstance): Promise<void> {
  const staticDir = env.WEB_STATIC_DIR;
  if (!staticDir || !existsSync(staticDir)) return;

  const indexPath = join(staticDir, "index.html");
  // Read the built index.html once at boot; its asset <script>/<link> tags are
  // content-hashed and stable for the life of the process.
  const indexHtml = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
    : "<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>";

  const fastifyStatic = (await import("@fastify/static")).default;
  // index: false is critical — otherwise @fastify/static serves index.html
  // directly at "/", bypassing the SEO-injecting notFoundHandler below (only "/"
  // is affected; client routes like /list/* aren't files so they already fall
  // through). With index disabled, "/" 404s into the fallback and gets its head.
  await app.register(fastifyStatic, {
    root: staticDir,
    wildcard: false,
    index: false,
  });

  app.get("/robots.txt", async (_req, reply) => {
    reply.header("content-type", "text/plain; charset=utf-8");
    reply.header("cache-control", "public, max-age=3600");
    return ROBOTS;
  });

  app.get("/sitemap.xml", async (_req, reply) => {
    reply.header("content-type", "application/xml; charset=utf-8");
    reply.header("cache-control", "public, max-age=1800");
    return buildSitemap();
  });

  // SPA fallback with SEO head injection.
  app.setNotFoundHandler(async (request, reply) => {
    if (request.method === "GET" && !isAppAsset(request.url)) {
      const meta = await buildMeta(request.url);
      reply.header("content-type", "text/html; charset=utf-8");
      // Let crawlers/CDN cache the rendered shell briefly; content updates via
      // the short upstream catalog TTL anyway.
      reply.header("cache-control", "public, max-age=300");
      return reply.send(injectSeo(indexHtml, meta));
    }
    return reply
      .code(404)
      .send({ error: "NotFound", message: "Route not found" });
  });
}
