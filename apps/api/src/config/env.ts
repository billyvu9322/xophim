import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

// Walk up to the workspace root (where pnpm-workspace.yaml lives) so the same
// .env is found regardless of which app cwd the process starts in.
function resolveEnvRootDir(fromDir: string): string {
  let currentDir = fromDir;
  while (true) {
    if (fs.existsSync(join(currentDir, "pnpm-workspace.yaml"))) return currentDir;
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) return fromDir;
    currentDir = parentDir;
  }
}

const apiDir = resolveApiDir(dirname(fileURLToPath(import.meta.url)));
const rootDir = resolveEnvRootDir(apiDir);
const nodeEnv = process.env.NODE_ENV ?? "development";

// Find apps/api (its own .env) — climb from src/config to the package root.
function resolveApiDir(fromDir: string): string {
  let currentDir = fromDir;
  while (true) {
    if (fs.existsSync(join(currentDir, "package.json"))) return currentDir;
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) return fromDir;
    currentDir = parentDir;
  }
}

// Load env files from both the api package and the workspace root.
for (const dir of [apiDir, rootDir]) {
  for (const file of [`.env.${nodeEnv}`, ".env"]) {
    const filePath = join(dir, file);
    if (fs.existsSync(filePath)) process.loadEnvFile(filePath);
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(5243),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .optional(),

  DATABASE_URL: z.string().url(),

  // KKPhim content API (proxied by the CATALOG layer).
  KKPHIM_BASE_URL: z.string().url().default("https://phimapi.com"),

  // Absolute path to the built SPA (dist) — set only in the single-image deploy.
  WEB_STATIC_DIR: z.string().optional(),

  // Public canonical origin (no trailing slash) — used to build absolute
  // canonical/OG/sitemap URLs for SEO. MUST be the real production domain in
  // prod (e.g. https://xophim.example) or canonical tags point at localhost.
  SITE_URL: z
    .string()
    .url()
    .default("http://localhost:5173")
    .transform((v) => v.replace(/\/+$/, "")),

  // Comma-separated allow-list of browser origins for CORS.
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .transform((value) =>
      value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  // Auth — Google OAuth2 + PKCE (optional until configured).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Must match exactly what's registered in Google Cloud Console.
  GOOGLE_REDIRECT_URI: z.string().url().optional(),

  // Cookie maxAge = SESSION_TTL_DAYS * 86400 seconds. Default 30 days.
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Where to redirect after the OAuth callback (the web origin).
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),

  // Password gate for the private analysis dashboard. Override in production.
  DASHBOARD_ANALYSIS_PASSWORD: z.string().min(8).default("binhhp20"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment configuration:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;
export type AppEnv = typeof env;
