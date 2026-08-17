// Server-side SEO head injection. The web app is a client-rendered SPA, so every
// route otherwise ships the same empty index.html with one static <title>.
// Googlebot indexes what the HTML contains on the FIRST pass, so we template a
// real per-route <head> (title, description, canonical, Open Graph, Twitter card,
// JSON-LD) into the built index.html before serving it. No routing rewrite, no
// SSR framework — just the head the crawlers actually read.

export interface SeoMeta {
  title: string;
  description: string;
  /** Absolute canonical URL. */
  canonical: string;
  /** Absolute OG image URL (poster/thumb). */
  image?: string;
  /** og:type — "website" for listings, "video.movie" for a film. */
  ogType?: string;
  /** When true, emit <meta name="robots" content="noindex,follow">. */
  noindex?: boolean;
  /** JSON-LD structured-data objects (schema.org). */
  jsonLd?: Array<Record<string, unknown>>;
}

// Escape a value for insertion into an HTML attribute / text node. Prevents a
// movie title/description with quotes or <> from breaking the markup.
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// JSON-LD goes inside <script type="application/ld+json">; only "<" needs
// neutralizing so a "</script>" in the data can't close the tag early.
function jsonLdSafe(obj: Record<string, unknown>): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

function tags(meta: SeoMeta): string {
  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const url = escapeHtml(meta.canonical);
  const img = meta.image ? escapeHtml(meta.image) : "";
  const ogType = meta.ogType ?? "website";

  const out: string[] = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${url}" />`,
    meta.noindex
      ? `<meta name="robots" content="noindex,follow" />`
      : `<meta name="robots" content="index,follow,max-image-preview:large" />`,
    // Open Graph
    `<meta property="og:site_name" content="XoPhim" />`,
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${url}" />`,
    // Twitter
    `<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
  ];
  if (img) {
    out.push(`<meta property="og:image" content="${img}" />`);
    out.push(`<meta name="twitter:image" content="${img}" />`);
  }
  for (const ld of meta.jsonLd ?? []) {
    out.push(`<script type="application/ld+json">${jsonLdSafe(ld)}</script>`);
  }
  return out.join("\n    ");
}

// Replace the static <title>…</title> and inject the SEO tags before </head>.
// The built index.html ships a placeholder <title>; we strip it so there's never
// a duplicate title element.
export function injectSeo(html: string, meta: SeoMeta): string {
  const withoutTitle = html.replace(/<title>[\s\S]*?<\/title>/i, "");
  const block = `${tags(meta)}\n  </head>`;
  return withoutTitle.replace(/<\/head>/i, block);
}
