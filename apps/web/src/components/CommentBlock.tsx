import { Link } from "@tanstack/react-router";
import { Heart, Trash2, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/Button";
import { LoadingState } from "./ui/states";
import { useAuth } from "@/hooks/auth";
import {
  useComments,
  useDeleteComment,
  useLikeComment,
  usePostComment,
} from "@/hooks/community";
import type { Comment, CommentReply } from "@/lib/community-types";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

// Comment section under the player (DESIGN.md §4 "Comment Block"). Composer +
// flat list separated by hairline dividers, likes, one level of replies.
export function CommentBlock({ slug }: { slug: string }) {
  const { data: user } = useAuth();
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useComments(slug);
  const post = usePostComment(slug);
  const [body, setBody] = useState("");

  const comments = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.pagination.totalItems ?? 0;

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    post.mutate({ body: text }, { onSuccess: () => setBody("") });
  };

  return (
    <section className="space-y-5">
      <h2 className="text-xl font-semibold text-white">Bình Luận {total > 0 && `(${total})`}</h2>

      {user ? (
        <div className="flex gap-3">
          <Avatar />
          <div className="flex-1 space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Viết bình luận..."
              rows={3}
              className="w-full resize-none rounded-md bg-elevated p-3 text-sm text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={submit} disabled={post.isPending || !body.trim()}>
                Gửi
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-md bg-chrome p-4 text-sm text-muted">
          <Link to="/dang-nhap" className="text-gold hover:underline">
            Đăng nhập
          </Link>{" "}
          để bình luận
        </p>
      )}

      {isLoading ? (
        <LoadingState />
      ) : comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Hãy là người đầu tiên bình luận</p>
      ) : (
        <ul className="divide-y divide-slate/40">
          {comments.map((c) => (
            <CommentRow key={c.id} slug={slug} comment={c} currentUserId={user?.id ?? null} />
          ))}
        </ul>
      )}

      {hasNextPage && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? "Đang tải..." : "Xem thêm bình luận"}
          </Button>
        </div>
      )}
    </section>
  );
}

function Avatar() {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-elevated text-muted">
      <UserIcon className="h-5 w-5" />
    </span>
  );
}

function CommentRow({
  slug,
  comment,
  currentUserId,
}: {
  slug: string;
  comment: Comment;
  currentUserId: string | null;
}) {
  const like = useLikeComment(slug);
  const del = useDeleteComment(slug);
  const post = usePostComment(slug);
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState("");

  const submitReply = () => {
    const text = replyBody.trim();
    if (!text) return;
    post.mutate(
      { body: text, parentId: comment.id },
      {
        onSuccess: () => {
          setReplyBody("");
          setReplying(false);
        },
      },
    );
  };

  return (
    <li className="py-4">
      <CommentBody
        item={comment}
        canDelete={!comment.isDeleted && currentUserId === comment.userId}
        onLike={() => like.mutate(comment.id)}
        onDelete={() => del.mutate(comment.id)}
        onReply={() => setReplying((v) => !v)}
      />

      {replying && (
        <div className="mt-2 flex gap-2 pl-12">
          <input
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Trả lời..."
            className="h-9 flex-1 rounded-md bg-elevated px-3 text-sm text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold"
          />
          <Button size="sm" onClick={submitReply} disabled={post.isPending || !replyBody.trim()}>
            Gửi
          </Button>
        </div>
      )}

      {comment.replies.length > 0 && (
        <ul className="mt-3 space-y-3 border-l border-slate/40 pl-6">
          {comment.replies.map((r) => (
            <li key={r.id}>
              <CommentBody
                item={r}
                canDelete={!r.isDeleted && currentUserId === r.userId}
                onLike={() => like.mutate(r.id)}
                onDelete={() => del.mutate(r.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function CommentBody({
  item,
  canDelete,
  onLike,
  onDelete,
  onReply,
}: {
  item: Comment | CommentReply;
  canDelete: boolean;
  onLike: () => void;
  onDelete: () => void;
  onReply?: () => void;
}) {
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-white">Thành viên</span>
          <span className="text-xs text-muted">{timeAgo(item.createdAt)}</span>
          {item.editedAt && <span className="text-xs text-muted">(đã sửa)</span>}
        </div>
        <p className={cn("mt-1 text-sm", item.isDeleted ? "italic text-muted" : "text-silver")}>
          {item.isDeleted ? "[Bình luận đã bị xóa]" : item.body}
        </p>
        {!item.isDeleted && (
          <div className="mt-2 flex items-center gap-4 text-xs text-muted">
            <button
              onClick={onLike}
              className={cn("flex items-center gap-1 hover:text-gold", item.liked && "text-gold")}
            >
              <Heart className={cn("h-4 w-4", item.liked && "fill-gold")} /> {item.likeCount}
            </button>
            {onReply && (
              <button onClick={onReply} className="hover:text-gold">
                Trả lời
              </button>
            )}
            {canDelete && (
              <button onClick={onDelete} className="flex items-center gap-1 hover:text-[#FC887B]">
                <Trash2 className="h-4 w-4" /> Xóa
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
