export interface CommentReply {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  likeCount: number;
  liked: boolean;
}

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

export interface PostCommentInput {
  body: string;
  parentId?: string;
}

export interface RatingResult {
  avg: number | null;
  count: number;
  mine: number | null;
}

export type ReportReason = "khong-phat" | "sai-phim" | "loi-phu-de" | "giat-lag";

export interface ReportInput {
  slug: string;
  episodeSlug?: string;
  reason: ReportReason;
  note?: string;
}
