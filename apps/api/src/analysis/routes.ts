import { and, count, desc, eq, gt, max, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { sessions, users, watchlist, watchProgress } from "../db/schema/index.js";

const analysisPasswordHeader = "x-analysis-password";

const userSchema = z.object({
  id: z.string().uuid(),
  username: z.string().nullable(),
  email: z.string(),
  role: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  activeSessions: z.number().int(),
  lastLoginAt: z.string().datetime().nullable(),
  lastUserAgent: z.string().nullable(),
  lastIp: z.string().nullable(),
  watchProgressCount: z.number().int(),
  watchlistCount: z.number().int(),
  lastWatchAt: z.string().datetime().nullable(),
});

const topMovieSchema = z.object({
  movieSlug: z.string(),
  name: z.string(),
  posterUrl: z.string(),
  watchers: z.number().int(),
  progressRows: z.number().int(),
  lastWatchedAt: z.string().datetime(),
});

const recentActivitySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string(),
  displayName: z.string(),
  movieSlug: z.string(),
  movieName: z.string(),
  posterUrl: z.string(),
  episodeSlug: z.string(),
  serverName: z.string(),
  positionSec: z.number().int(),
  durationSec: z.number().int().nullable(),
  updatedAt: z.string().datetime(),
});

const responseSchema = z.object({
  summary: z.object({
    totalUsers: z.number().int(),
    activeSessions: z.number().int(),
    usersWithHistory: z.number().int(),
    totalProgressRows: z.number().int(),
    totalWatchlistRows: z.number().int(),
  }),
  users: z.array(userSchema),
  topMovies: z.array(topMovieSchema),
  recentActivity: z.array(recentActivitySchema),
});

export function toAnalysisCount(value: number | string | bigint | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function movieName(snapshot: unknown): string {
  if (snapshot && typeof snapshot === "object" && "name" in snapshot) {
    const value = (snapshot as { name?: unknown }).name;
    if (typeof value === "string") return value;
  }
  return "Không rõ tên phim";
}

function posterUrl(snapshot: unknown): string {
  if (snapshot && typeof snapshot === "object" && "posterUrl" in snapshot) {
    const value = (snapshot as { posterUrl?: unknown }).posterUrl;
    if (typeof value === "string") return value;
  }
  return "";
}

export const registerAnalysisRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", async (request, reply) => {
    const password = request.headers[analysisPasswordHeader];
    if (password !== app.env.DASHBOARD_ANALYSIS_PASSWORD) {
      return reply.code(401).send({ error: "Unauthorized", message: "Invalid dashboard password" });
    }
  });

  app.get(
    "/overview",
    {
      schema: {
        response: {
          200: responseSchema,
        },
      },
    },
    async () => {
      const now = new Date();

      const [totalUsersRow] = await app.db.select({ value: count() }).from(users);
      const [activeSessionsRow] = await app.db
        .select({ value: count() })
        .from(sessions)
        .where(gt(sessions.expiresAt, now));
      const [usersWithHistoryRow] = await app.db
        .select({ value: sql<number>`count(distinct ${watchProgress.user_id})` })
        .from(watchProgress);
      const [totalProgressRowsRow] = await app.db.select({ value: count() }).from(watchProgress);
      const [totalWatchlistRowsRow] = await app.db.select({ value: count() }).from(watchlist);

      const userRows = await app.db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          createdAt: users.createdAt,
          activeSessions: sql<number>`count(distinct ${sessions.id})`,
          lastLoginAt: max(sessions.createdAt),
          lastUserAgent: sql<string | null>`(array_remove(array_agg(${sessions.userAgent} order by ${sessions.createdAt} desc), null))[1]`,
          lastIp: sql<string | null>`(array_remove(array_agg(${sessions.ip} order by ${sessions.createdAt} desc), null))[1]`,
          watchProgressCount: sql<number>`count(distinct ${watchProgress.id})`,
          watchlistCount: sql<number>`count(distinct ${watchlist.id})`,
          lastWatchAt: max(watchProgress.updated_at),
        })
        .from(users)
        .leftJoin(sessions, and(eq(sessions.userId, users.id), gt(sessions.expiresAt, now)))
        .leftJoin(watchProgress, eq(watchProgress.user_id, users.id))
        .leftJoin(watchlist, eq(watchlist.user_id, users.id))
        .groupBy(users.id)
        .orderBy(desc(users.createdAt));

      const topMovieRows = await app.db
        .select({
          movieSlug: watchProgress.movie_slug,
          snapshot: sql<unknown>`(array_agg(${watchProgress.movie_snapshot} order by ${watchProgress.updated_at} desc))[1]`,
          watchers: sql<number>`count(distinct ${watchProgress.user_id})`,
          progressRows: count(),
          lastWatchedAt: max(watchProgress.updated_at),
        })
        .from(watchProgress)
        .groupBy(watchProgress.movie_slug)
        .orderBy(desc(max(watchProgress.updated_at)))
        .limit(10);

      const recentRows = await app.db
        .select({
          id: watchProgress.id,
          userId: users.id,
          email: users.email,
          displayName: users.displayName,
          movieSlug: watchProgress.movie_slug,
          episodeSlug: watchProgress.episode_slug,
          serverName: watchProgress.server_name,
          positionSec: watchProgress.position_sec,
          durationSec: watchProgress.duration_sec,
          snapshot: watchProgress.movie_snapshot,
          updatedAt: watchProgress.updated_at,
        })
        .from(watchProgress)
        .innerJoin(users, eq(users.id, watchProgress.user_id))
        .orderBy(desc(watchProgress.updated_at))
        .limit(20);

      return {
        summary: {
          totalUsers: toAnalysisCount(totalUsersRow?.value),
          activeSessions: toAnalysisCount(activeSessionsRow?.value),
          usersWithHistory: toAnalysisCount(usersWithHistoryRow?.value),
          totalProgressRows: toAnalysisCount(totalProgressRowsRow?.value),
          totalWatchlistRows: toAnalysisCount(totalWatchlistRowsRow?.value),
        },
        users: userRows.map((row) => ({
          id: row.id,
          username: row.username,
          email: row.email,
          role: row.role,
          displayName: row.displayName,
          avatarUrl: row.avatarUrl,
          createdAt: row.createdAt.toISOString(),
          activeSessions: Number(row.activeSessions),
          lastLoginAt: toIso(row.lastLoginAt),
          lastUserAgent: row.lastUserAgent,
          lastIp: row.lastIp,
          watchProgressCount: Number(row.watchProgressCount),
          watchlistCount: Number(row.watchlistCount),
          lastWatchAt: toIso(row.lastWatchAt),
        })),
        topMovies: topMovieRows
          .filter((row) => row.lastWatchedAt)
          .map((row) => ({
            movieSlug: row.movieSlug,
            name: movieName(row.snapshot),
            posterUrl: posterUrl(row.snapshot),
            watchers: Number(row.watchers),
            progressRows: Number(row.progressRows),
            lastWatchedAt: toIso(row.lastWatchedAt)!,
          })),
        recentActivity: recentRows.map((row) => ({
          id: row.id,
          userId: row.userId,
          email: row.email,
          displayName: row.displayName,
          movieSlug: row.movieSlug,
          movieName: movieName(row.snapshot),
          posterUrl: posterUrl(row.snapshot),
          episodeSlug: row.episodeSlug,
          serverName: row.serverName,
          positionSec: row.positionSec,
          durationSec: row.durationSec,
          updatedAt: row.updatedAt.toISOString(),
        })),
      };
    },
  );
};
