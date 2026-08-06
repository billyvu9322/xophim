import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { readOptionalUser } from "../auth/optional-auth.js";
import { commentLikes, comments, ratings, reports } from "../db/schema/community.js";
import { assertCanDelete, assertCanEdit, computeRating, listComments } from "./service.js";
import "../auth/types.js"; // request.user augmentation

// Tighter rate limit for community writes (20/min/IP vs. global 100/min).
const WRITE_RATE_LIMIT = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

export const registerCommunityRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /v1/movies/:slug/comments?page — public, enriched if logged in.
  app.get(
    "/movies/:slug/comments",
    {
      schema: {
        params: z.object({ slug: z.string() }),
        querystring: z.object({ page: z.coerce.number().int().min(1).default(1) }),
      },
    },
    async (request) => {
      const optUser = await readOptionalUser(app.db, request.cookies?.sid);
      return listComments(app.db, request.params.slug, request.query.page, optUser?.id ?? null);
    },
  );

  // POST /v1/movies/:slug/comments — requireAuth; top-level or one-level reply.
  app.post(
    "/movies/:slug/comments",
    {
      preHandler: [app.requireAuth],
      ...WRITE_RATE_LIMIT,
      schema: {
        params: z.object({ slug: z.string() }),
        body: z.object({
          body: z.string().min(1).max(2000),
          parentId: z.string().uuid().optional(),
        }),
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const { body, parentId } = request.body;

      if (parentId) {
        const [parent] = await app.db
          .select()
          .from(comments)
          .where(eq(comments.id, parentId))
          .limit(1);
        if (!parent || parent.movieSlug !== request.params.slug) {
          return reply.code(400).send({ error: "BadRequest", message: "Invalid parentId" });
        }
        if (parent.parentId !== null) {
          return reply
            .code(400)
            .send({ error: "BadRequest", message: "Replies cannot nest deeper than one level" });
        }
      }

      const [inserted] = await app.db
        .insert(comments)
        .values({
          userId: user.id,
          movieSlug: request.params.slug,
          parentId: parentId ?? null,
          body,
        })
        .returning();
      return reply.code(201).send(inserted);
    },
  );

  // PATCH /v1/comments/:id — requireAuth, owner only.
  app.patch(
    "/comments/:id",
    {
      preHandler: [app.requireAuth],
      ...WRITE_RATE_LIMIT,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ body: z.string().min(1).max(2000) }),
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const [comment] = await app.db
        .select()
        .from(comments)
        .where(eq(comments.id, request.params.id))
        .limit(1);
      if (!comment) return reply.code(404).send({ error: "NotFound", message: "Comment not found" });
      if (comment.deletedAt) {
        return reply.code(410).send({ error: "Gone", message: "Comment has been deleted" });
      }

      assertCanEdit({ commentUserId: comment.userId, requestUserId: user.id });

      const [updated] = await app.db
        .update(comments)
        .set({ body: request.body.body, editedAt: new Date() })
        .where(eq(comments.id, request.params.id))
        .returning();
      return updated;
    },
  );

  // DELETE /v1/comments/:id — requireAuth, owner OR admin, soft delete.
  app.delete(
    "/comments/:id",
    {
      preHandler: [app.requireAuth],
      ...WRITE_RATE_LIMIT,
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request, reply) => {
      const user = request.user!;
      const [comment] = await app.db
        .select()
        .from(comments)
        .where(eq(comments.id, request.params.id))
        .limit(1);
      if (!comment) return reply.code(404).send({ error: "NotFound", message: "Comment not found" });

      assertCanDelete({
        commentUserId: comment.userId,
        requestUserId: user.id,
        role: user.role,
      });

      await app.db
        .update(comments)
        .set({ deletedAt: new Date() })
        .where(eq(comments.id, request.params.id));
      return reply.code(204).send();
    },
  );

  // PUT /v1/comments/:id/like — requireAuth, toggle.
  app.put(
    "/comments/:id/like",
    {
      preHandler: [app.requireAuth],
      ...WRITE_RATE_LIMIT,
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request, reply) => {
      const user = request.user!;
      const commentId = request.params.id;

      const [comment] = await app.db
        .select()
        .from(comments)
        .where(eq(comments.id, commentId))
        .limit(1);
      if (!comment) return reply.code(404).send({ error: "NotFound", message: "Comment not found" });

      const [existing] = await app.db
        .select()
        .from(commentLikes)
        .where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, user.id)))
        .limit(1);

      if (existing) {
        await app.db
          .delete(commentLikes)
          .where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, user.id)));
        return reply.send({ liked: false });
      }
      await app.db
        .insert(commentLikes)
        .values({ commentId, userId: user.id })
        .onConflictDoNothing();
      return reply.send({ liked: true });
    },
  );

  // GET /v1/movies/:slug/rating — public.
  app.get(
    "/movies/:slug/rating",
    { schema: { params: z.object({ slug: z.string() }) } },
    async (request) => {
      const optUser = await readOptionalUser(app.db, request.cookies?.sid);
      return computeRating(app.db, request.params.slug, optUser?.id ?? null);
    },
  );

  // PUT /v1/movies/:slug/rating — requireAuth, upsert.
  app.put(
    "/movies/:slug/rating",
    {
      preHandler: [app.requireAuth],
      ...WRITE_RATE_LIMIT,
      schema: {
        params: z.object({ slug: z.string() }),
        body: z.object({ score: z.number().int().min(1).max(5) }),
      },
    },
    async (request) => {
      const user = request.user!;
      const movieSlug = request.params.slug;
      await app.db
        .insert(ratings)
        .values({ userId: user.id, movieSlug, score: request.body.score })
        .onConflictDoUpdate({
          target: [ratings.userId, ratings.movieSlug],
          set: { score: request.body.score, updatedAt: new Date() },
        });
      return computeRating(app.db, movieSlug, user.id);
    },
  );

  // POST /v1/reports — PUBLIC (guests may report; user_id null when anonymous).
  app.post(
    "/reports",
    {
      ...WRITE_RATE_LIMIT,
      schema: {
        body: z.object({
          slug: z.string().min(1),
          episodeSlug: z.string().optional(),
          reason: z.enum(["khong-phat", "sai-phim", "loi-phu-de", "giat-lag"]),
          note: z.string().max(500).optional(),
        }),
        response: { 201: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const optUser = await readOptionalUser(app.db, request.cookies?.sid);
      const { slug, episodeSlug, reason, note } = request.body;
      const [inserted] = await app.db
        .insert(reports)
        .values({
          userId: optUser?.id ?? null,
          movieSlug: slug,
          episodeSlug: episodeSlug ?? null,
          reason,
          note: note ?? null,
        })
        .returning({ id: reports.id });
      return reply.code(201).send({ id: inserted!.id });
    },
  );
};
