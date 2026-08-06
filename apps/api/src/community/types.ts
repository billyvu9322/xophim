/** A single reply (child) nested under a top-level comment. */
export interface CommentReply {
  id: string;
  userId: string;
  body: string; // "[đã xóa]" when deleted
  createdAt: string; // ISO 8601
  editedAt: string | null;
  isDeleted: boolean;
  likeCount: number;
  liked: boolean;
}

/** A top-level comment with its one-level reply thread. */
export interface Comment {
  id: string;
  userId: string;
  movieSlug: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  likeCount: number;
  liked: boolean;
  replies: CommentReply[];
}

export interface CommentPage {
  items: Comment[];
  pagination: {
    page: number;
    totalPages: number;
    totalItems: number;
  };
}

export interface RatingResult {
  avg: number | null; // null when no ratings yet
  count: number;
  mine: number | null; // requesting user's score, or null
}

export type ReportReason = "khong-phat" | "sai-phim" | "loi-phu-de" | "giat-lag";
