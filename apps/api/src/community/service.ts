import { and, avg, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { commentLikes, comments, ratings } from "../db/schema/community.js";
import type { Comment, CommentPage, RatingResult } from "./types.js";

// ---------------------------------------------------------------------------
// Permission helpers (pure — unit-tested without DB)
// ---------------------------------------------------------------------------

interface PermissionArgs {
  commentUserId: string;
  requestUserId: string;
  role?: string;
}

/** PATCH is owner-only. Throws a 403-shaped error if the caller isn't the owner. */
export function assertCanEdit(args: PermissionArgs): void {
  if (args.commentUserId !== args.requestUserId) {
    const err = new Error("Forbidden: only the comment owner can edit") as Error & {
      statusCode: number;
    };
    err.statusCode = 403;
    throw err;
  }
}

/** DELETE is owner OR admin. Throws 403 if neither. */
export function assertCanDelete(args: PermissionArgs): void {
  if (args.requestUserId === args.commentUserId) return;
  if (args.role === "admin") return;
  const err = new Error("Forbidden: you cannot delete this comment") as Error & {
    statusCode: number;
  };
  err.statusCode = 403;
  throw err;
}

/** Display body: real text, or "[đã xóa]" when soft-deleted. */
export function maskDeletedBody(body: string, deletedAt: Date | null): string {
  return deletedAt !== null ? "[đã xóa]" : body;
}

// ---------------------------------------------------------------------------
// Comment queries
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

async function countTopLevel(db: Database, movieSlug: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(comments)
    .where(and(eq(comments.movieSlug, movieSlug), isNull(comments.parentId)));
  return Number(rows[0]?.value ?? 0);
}

export async function listComments(
  db: Database,
  movieSlug: string,
  page: number,
  userId: string | null,
): Promise<CommentPage> {
  const offset = (page - 1) * PAGE_SIZE;

  const topLevel = await db
    .select()
    .from(comments)
    .where(and(eq(comments.movieSlug, movieSlug), isNull(comments.parentId)))
    .orderBy(desc(comments.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  const total = await countTopLevel(db, movieSlug);

  if (topLevel.length === 0) {
    return {
      items: [],
      pagination: { page, totalPages: Math.ceil(total / PAGE_SIZE) || 1, totalItems: total },
    };
  }

  const topIds = topLevel.map((c) => c.id);

  const idArray = (ids: string[]) =>
    sql`ANY(ARRAY[${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )}])`;

  const replies = await db
    .select()
    .from(comments)
    .where(sql`${comments.parentId} = ${idArray(topIds)}`)
    .orderBy(comments.createdAt);

  const allIds = [...topIds, ...replies.map((r) => r.id)];

  const likeCounts = await db
    .select({ commentId: commentLikes.commentId, cnt: count() })
    .from(commentLikes)
    .where(sql`${commentLikes.commentId} = ${idArray(allIds)}`)
    .groupBy(commentLikes.commentId);

  const userLikes =
    userId !== null
      ? await db
          .select({ commentId: commentLikes.commentId })
          .from(commentLikes)
          .where(
            and(
              eq(commentLikes.userId, userId),
              sql`${commentLikes.commentId} = ${idArray(allIds)}`,
            ),
          )
      : [];

  const likeCountMap = new Map(likeCounts.map((r) => [r.commentId, Number(r.cnt)]));
  const likedSet = new Set(userLikes.map((r) => r.commentId));

  const replyMap = new Map<string, typeof replies>();
  for (const r of replies) {
    if (!r.parentId) continue;
    const arr = replyMap.get(r.parentId) ?? [];
    arr.push(r);
    replyMap.set(r.parentId, arr);
  }

  const items: Comment[] = topLevel.map((c) => ({
    id: c.id,
    userId: c.userId,
    movieSlug: c.movieSlug,
    body: maskDeletedBody(c.body, c.deletedAt),
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt?.toISOString() ?? null,
    isDeleted: c.deletedAt !== null,
    likeCount: likeCountMap.get(c.id) ?? 0,
    liked: likedSet.has(c.id),
    replies: (replyMap.get(c.id) ?? []).map((r) => ({
      id: r.id,
      userId: r.userId,
      body: maskDeletedBody(r.body, r.deletedAt),
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt?.toISOString() ?? null,
      isDeleted: r.deletedAt !== null,
      likeCount: likeCountMap.get(r.id) ?? 0,
      liked: likedSet.has(r.id),
    })),
  }));

  return {
    items,
    pagination: { page, totalPages: Math.ceil(total / PAGE_SIZE) || 1, totalItems: total },
  };
}

// ---------------------------------------------------------------------------
// Rating aggregate
// ---------------------------------------------------------------------------

export async function computeRating(
  db: Database,
  movieSlug: string,
  userId: string | null,
): Promise<RatingResult> {
  const [row] = await db
    .select({ avg: avg(ratings.score), count: count() })
    .from(ratings)
    .where(eq(ratings.movieSlug, movieSlug));

  const avgRaw = row?.avg != null ? parseFloat(String(row.avg)) : null;
  const avgVal = avgRaw != null && !Number.isNaN(avgRaw) ? avgRaw : null;
  const countVal = Number(row?.count ?? 0);

  let mine: number | null = null;
  if (userId) {
    const [myRow] = await db
      .select({ score: ratings.score })
      .from(ratings)
      .where(and(eq(ratings.userId, userId), eq(ratings.movieSlug, movieSlug)))
      .limit(1);
    mine = myRow?.score ?? null;
  }

  return { avg: avgVal, count: countVal, mine };
}
