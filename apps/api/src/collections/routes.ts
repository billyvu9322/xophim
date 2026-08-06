import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { collectionItems, collections } from "../db/schema/index.js";
import { enrichItems, filterPublished, sortBySort } from "./helpers.js";
import "../auth/types.js"; // request.user augmentation

const collectionWriteBody = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab"),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  cover_url: z.string().url().optional().default(""),
  is_published: z.boolean().optional().default(false),
  sort: z.number().int().min(0).optional().default(0),
});

const movieSnapshotSchema = z.object({
  name: z.string().default(""),
  posterUrl: z.string().default(""),
  thumbUrl: z.string().default(""),
  type: z.string().default(""),
  year: z.number().nullable().optional().default(null),
  quality: z.string().default(""),
});

const itemBody = z.object({
  snapshot: movieSnapshotSchema,
  sort: z.number().int().min(0).optional().default(0),
});

export const registerCollectionsRoutes: FastifyPluginAsyncZod = async (app) => {
  // requireAdmin builds on the inherited requireAuth (P2, decorated on /v1):
  // authenticate first, then assert role === 'admin'.
  const requireAdmin = async (
    request: Parameters<typeof app.requireAuth>[0],
    reply: Parameters<typeof app.requireAuth>[1],
  ) => {
    await app.requireAuth(request, reply);
    if (!request.user) return; // requireAuth already sent 401
    if (request.user.role !== "admin") {
      return reply.code(403).send({ error: "Forbidden", message: "Admin role required" });
    }
  };

  // Public: list published collections, sorted.
  app.get("/", async () => {
    const rows = await app.db.select().from(collections);
    return sortBySort(filterPublished(rows)).map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      cover_url: c.cover_url,
      sort: c.sort,
      created_at: c.created_at.toISOString(),
    }));
  });

  // Public: collection detail + enriched items.
  app.get(
    "/:slug",
    { schema: { params: z.object({ slug: z.string() }) } },
    async (request, reply) => {
      const [col] = await app.db
        .select()
        .from(collections)
        .where(eq(collections.slug, request.params.slug));
      if (!col || !col.is_published) {
        return reply.code(404).send({ error: "NotFound", message: "Collection not found" });
      }
      const rawItems = await app.db
        .select()
        .from(collectionItems)
        .where(eq(collectionItems.collection_id, col.id));
      return {
        id: col.id,
        slug: col.slug,
        title: col.title,
        description: col.description,
        cover_url: col.cover_url,
        sort: col.sort,
        created_at: col.created_at.toISOString(),
        items: sortBySort(enrichItems(rawItems)),
      };
    },
  );

  // Admin: create.
  app.post(
    "/",
    { preHandler: requireAdmin, schema: { body: collectionWriteBody } },
    async (request, reply) => {
      const [existing] = await app.db
        .select({ id: collections.id })
        .from(collections)
        .where(eq(collections.slug, request.body.slug));
      if (existing) {
        return reply.code(409).send({ error: "Conflict", message: "Slug already exists" });
      }
      const [created] = await app.db
        .insert(collections)
        .values({ ...request.body, created_by: request.user!.id })
        .returning({ id: collections.id });
      return reply.code(201).send({ id: created!.id });
    },
  );

  // Admin: update.
  app.patch(
    "/:id",
    {
      preHandler: requireAdmin,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: collectionWriteBody.partial(),
      },
    },
    async (request, reply) => {
      const [existing] = await app.db
        .select({ id: collections.id })
        .from(collections)
        .where(eq(collections.id, request.params.id));
      if (!existing) {
        return reply.code(404).send({ error: "NotFound", message: "Collection not found" });
      }
      const [updated] = await app.db
        .update(collections)
        .set(request.body)
        .where(eq(collections.id, request.params.id))
        .returning({ id: collections.id });
      return { id: updated!.id };
    },
  );

  // Admin: delete.
  app.delete(
    "/:id",
    { preHandler: requireAdmin, schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      const result = await app.db
        .delete(collections)
        .where(eq(collections.id, request.params.id))
        .returning({ id: collections.id });
      if (result.length === 0) {
        return reply.code(404).send({ error: "NotFound", message: "Collection not found" });
      }
      return reply.code(204).send();
    },
  );

  // Admin: upsert item.
  app.put(
    "/:id/items/:slug",
    {
      preHandler: requireAdmin,
      schema: { params: z.object({ id: z.string().uuid(), slug: z.string() }), body: itemBody },
    },
    async (request, reply) => {
      const [col] = await app.db
        .select({ id: collections.id })
        .from(collections)
        .where(eq(collections.id, request.params.id));
      if (!col) {
        return reply.code(404).send({ error: "NotFound", message: "Collection not found" });
      }
      await app.db
        .insert(collectionItems)
        .values({
          collection_id: request.params.id,
          movie_slug: request.params.slug,
          sort: request.body.sort,
          movie_snapshot: request.body.snapshot,
        })
        .onConflictDoUpdate({
          target: [collectionItems.collection_id, collectionItems.movie_slug],
          set: { sort: request.body.sort, movie_snapshot: request.body.snapshot },
        });
      return { ok: true };
    },
  );

  // Admin: remove item.
  app.delete(
    "/:id/items/:slug",
    {
      preHandler: requireAdmin,
      schema: { params: z.object({ id: z.string().uuid(), slug: z.string() }) },
    },
    async (request, reply) => {
      const result = await app.db
        .delete(collectionItems)
        .where(
          and(
            eq(collectionItems.collection_id, request.params.id),
            eq(collectionItems.movie_slug, request.params.slug),
          ),
        )
        .returning({ collection_id: collectionItems.collection_id });
      if (result.length === 0) {
        return reply.code(404).send({ error: "NotFound", message: "Item not found" });
      }
      return reply.code(204).send();
    },
  );
};
