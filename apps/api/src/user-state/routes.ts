import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { watchlist, watchProgress } from "../db/schema/index.js";
import { shouldOverwriteProgress } from "./logic.js";
import "../auth/types.js"; // load request.user augmentation

const movieSnapshotSchema = z.object({
  name: z.string(),
  posterUrl: z.string(),
  type: z.string(),
  year: z.number().nullable(),
});

const watchlistItemSchema = z.object({
  id: z.string().uuid(),
  movie_slug: z.string(),
  movie_snapshot: movieSnapshotSchema,
  created_at: z.string().datetime(),
});

const progressItemSchema = z.object({
  id: z.string().uuid(),
  movie_slug: z.string(),
  episode_slug: z.string(),
  server_name: z.string(),
  position_sec: z.number().int(),
  duration_sec: z.number().int().nullable(),
  movie_snapshot: movieSnapshotSchema,
  updated_at: z.string().datetime(),
});

export const registerUserStateRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/me/watchlist
  app.get(
    "/watchlist",
    {
      preHandler: app.requireAuth,
      schema: { response: { 200: z.object({ items: z.array(watchlistItemSchema) }) } },
    },
    async (request) => {
      const rows = await app.db
        .select()
        .from(watchlist)
        .where(eq(watchlist.user_id, request.user!.id))
        .orderBy(desc(watchlist.created_at));
      return {
        items: rows.map((r) => ({
          id: r.id,
          movie_slug: r.movie_slug,
          movie_snapshot: r.movie_snapshot,
          created_at: r.created_at.toISOString(),
        })),
      };
    },
  );

  // PUT /v1/me/watchlist/:slug — add (idempotent)
  app.put(
    "/watchlist/:slug",
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ slug: z.string().min(1) }),
        body: z.object({ movie_snapshot: movieSnapshotSchema }),
        response: { 200: watchlistItemSchema },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const userId = request.user!.id;

      const [existing] = await app.db
        .select()
        .from(watchlist)
        .where(and(eq(watchlist.user_id, userId), eq(watchlist.movie_slug, slug)))
        .limit(1);

      const row =
        existing ??
        (
          await app.db
            .insert(watchlist)
            .values({
              user_id: userId,
              movie_slug: slug,
              movie_snapshot: request.body.movie_snapshot,
            })
            .returning()
        )[0];

      if (!row) {
        const err = new Error("Failed to add to watchlist") as Error & { statusCode: number };
        err.statusCode = 500;
        throw err;
      }

      return reply.code(200).send({
        id: row.id,
        movie_slug: row.movie_slug,
        movie_snapshot: row.movie_snapshot,
        created_at: row.created_at.toISOString(),
      });
    },
  );

  // DELETE /v1/me/watchlist/:slug
  app.delete(
    "/watchlist/:slug",
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ slug: z.string().min(1) }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request, reply) => {
      await app.db
        .delete(watchlist)
        .where(
          and(
            eq(watchlist.user_id, request.user!.id),
            eq(watchlist.movie_slug, request.params.slug),
          ),
        );
      return reply.code(200).send({ ok: true as const });
    },
  );

  // GET /v1/me/history — ordered by updated_at desc; items with position_sec>0
  // also serve as the Xem Tiếp rail.
  app.get(
    "/history",
    {
      preHandler: app.requireAuth,
      schema: { response: { 200: z.object({ items: z.array(progressItemSchema) }) } },
    },
    async (request) => {
      const rows = await app.db
        .select()
        .from(watchProgress)
        .where(eq(watchProgress.user_id, request.user!.id))
        .orderBy(desc(watchProgress.updated_at));
      return {
        items: rows.map((r) => ({
          id: r.id,
          movie_slug: r.movie_slug,
          episode_slug: r.episode_slug,
          server_name: r.server_name,
          position_sec: r.position_sec,
          duration_sec: r.duration_sec ?? null,
          movie_snapshot: r.movie_snapshot,
          updated_at: r.updated_at.toISOString(),
        })),
      };
    },
  );

  // PUT /v1/me/progress — upsert on (user_id, movie_slug, episode_slug).
  // Only overwrites when the incoming update is strictly newer.
  app.put(
    "/progress",
    {
      preHandler: app.requireAuth,
      schema: {
        body: z.object({
          slug: z.string().min(1),
          episodeSlug: z.string().min(1),
          server: z.string().default(""),
          positionSec: z.number().int().min(0),
          durationSec: z.number().int().min(0).nullable().optional(),
          snapshot: movieSnapshotSchema,
        }),
        response: { 200: progressItemSchema },
      },
    },
    async (request, reply) => {
      const { slug, episodeSlug, server, positionSec, durationSec, snapshot } = request.body;
      const userId = request.user!.id;
      const now = new Date();

      const where = and(
        eq(watchProgress.user_id, userId),
        eq(watchProgress.movie_slug, slug),
        eq(watchProgress.episode_slug, episodeSlug),
      );

      const [existing] = await app.db
        .select()
        .from(watchProgress)
        .where(where)
        .limit(1);

      // Incoming is not newer → return the existing row unchanged.
      if (existing && !shouldOverwriteProgress(existing.updated_at, now)) {
        return reply.code(200).send({
          id: existing.id,
          movie_slug: existing.movie_slug,
          episode_slug: existing.episode_slug,
          server_name: existing.server_name,
          position_sec: existing.position_sec,
          duration_sec: existing.duration_sec ?? null,
          movie_snapshot: existing.movie_snapshot,
          updated_at: existing.updated_at.toISOString(),
        });
      }

      const [upserted] = await app.db
        .insert(watchProgress)
        .values({
          user_id: userId,
          movie_slug: slug,
          episode_slug: episodeSlug,
          server_name: server,
          position_sec: positionSec,
          duration_sec: durationSec ?? null,
          movie_snapshot: snapshot,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: [
            watchProgress.user_id,
            watchProgress.movie_slug,
            watchProgress.episode_slug,
          ],
          set: {
            server_name: server,
            position_sec: positionSec,
            duration_sec: durationSec ?? null,
            movie_snapshot: snapshot,
            updated_at: now,
          },
        })
        .returning();

      if (!upserted) {
        const err = new Error("Failed to upsert progress") as Error & { statusCode: number };
        err.statusCode = 500;
        throw err;
      }

      return reply.code(200).send({
        id: upserted.id,
        movie_slug: upserted.movie_slug,
        episode_slug: upserted.episode_slug,
        server_name: upserted.server_name,
        position_sec: upserted.position_sec,
        duration_sec: upserted.duration_sec ?? null,
        movie_snapshot: upserted.movie_snapshot,
        updated_at: upserted.updated_at.toISOString(),
      });
    },
  );

  // DELETE /v1/me/history/:slug — remove all progress rows for a movie.
  app.delete(
    "/history/:slug",
    {
      preHandler: app.requireAuth,
      schema: {
        params: z.object({ slug: z.string().min(1) }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (request, reply) => {
      await app.db
        .delete(watchProgress)
        .where(
          and(
            eq(watchProgress.user_id, request.user!.id),
            eq(watchProgress.movie_slug, request.params.slug),
          ),
        );
      return reply.code(200).send({ ok: true as const });
    },
  );
};
