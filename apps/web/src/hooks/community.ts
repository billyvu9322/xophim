import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { communityApi } from "@/apis/community-api";
import type {
  CommentPage,
  PostCommentInput,
  RatingResult,
  ReportInput,
} from "../apis/types/community-types";

export const communityKeys = {
  comments: (slug: string) => ["community", "comments", slug] as const,
  rating: (slug: string) => ["community", "rating", slug] as const,
};

// Paginated comment feed — useInfiniteQuery so "Load more" appends pages.
export function useComments(slug: string) {
  return useInfiniteQuery({
    queryKey: communityKeys.comments(slug),
    queryFn: ({ pageParam }) => communityApi.getComments(slug, pageParam),
    getNextPageParam: (lastPage: CommentPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    initialPageParam: 1,
    enabled: !!slug,
  });
}

export function usePostComment(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PostCommentInput) =>
      communityApi.postComment(slug, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: communityKeys.comments(slug) });
    },
  });
}

export function useDeleteComment(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => communityApi.deleteComment(commentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: communityKeys.comments(slug) });
    },
  });
}

// Toggle like with optimistic update across cached pages (top-level + replies).
export function useLikeComment(slug: string) {
  const qc = useQueryClient();
  const key = communityKeys.comments(slug);
  return useMutation({
    mutationFn: (commentId: string) => communityApi.likeComment(commentId),
    onMutate: async (commentId: string) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData(key);
      qc.setQueryData(
        key,
        (old: { pages: CommentPage[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          const flip = <
            T extends { id: string; liked: boolean; likeCount: number },
          >(
            x: T,
          ): T =>
            x.id === commentId
              ? {
                  ...x,
                  liked: !x.liked,
                  likeCount: x.likeCount + (x.liked ? -1 : 1),
                }
              : x;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((c) => ({
                ...flip(c),
                replies: c.replies.map(flip),
              })),
            })),
          };
        },
      );
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) qc.setQueryData(key, context.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useRating(slug: string) {
  return useQuery({
    queryKey: communityKeys.rating(slug),
    queryFn: () => communityApi.getRating(slug),
    enabled: !!slug,
    staleTime: 60_000,
  });
}

// Submit/update rating with optimistic avg estimate.
export function useRate(slug: string) {
  const qc = useQueryClient();
  const key = communityKeys.rating(slug);
  return useMutation({
    mutationFn: (score: number) => communityApi.putRating(slug, score),
    onMutate: async (score: number) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<RatingResult>(key);
      if (prev) {
        const wasRated = prev.mine !== null;
        const newCount = wasRated ? prev.count : prev.count + 1;
        const totalScore =
          (prev.avg ?? 0) * prev.count - (prev.mine ?? 0) + score;
        const newAvg = parseFloat((totalScore / newCount).toFixed(2));
        qc.setQueryData<RatingResult>(key, {
          avg: newAvg,
          count: newCount,
          mine: score,
        });
      }
      return { prev };
    },
    onError: (_err, _score, context) => {
      if (context?.prev) qc.setQueryData(key, context.prev);
    },
    onSuccess: (data) => {
      qc.setQueryData(key, data);
    },
  });
}

export function useReport() {
  return useMutation({
    mutationFn: (input: ReportInput) => communityApi.postReport(input),
  });
}
