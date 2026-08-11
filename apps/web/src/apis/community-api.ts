import { api } from "./api";
import type {
  Comment,
  CommentPage,
  PostCommentInput,
  RatingResult,
  ReportInput,
} from "./types/community-types";

const get = async <T>(url: string, params?: object): Promise<T> => {
  const res = await api.get<T>(url, { params });
  return res.data;
};
const post = async <T>(url: string, data?: unknown): Promise<T> => {
  const res = await api.post<T>(url, data);
  return res.data;
};
const put = async <T>(url: string, data?: unknown): Promise<T> => {
  const res = await api.put<T>(url, data);
  return res.data;
};
const patch = async <T>(url: string, data?: unknown): Promise<T> => {
  const res = await api.patch<T>(url, data);
  return res.data;
};
const del = async (url: string): Promise<void> => {
  await api.delete(url);
};

export const communityApi = {
  getComments: (slug: string, page: number) =>
    get<CommentPage>(`/movies/${slug}/comments`, { page }),
  postComment: (slug: string, input: PostCommentInput) =>
    post<Comment>(`/movies/${slug}/comments`, input),
  patchComment: (id: string, body: string) =>
    patch<Comment>(`/comments/${id}`, { body }),
  deleteComment: (id: string) => del(`/comments/${id}`),
  likeComment: (id: string) => put<{ liked: boolean }>(`/comments/${id}/like`),
  getRating: (slug: string) => get<RatingResult>(`/movies/${slug}/rating`),
  putRating: (slug: string, score: number) =>
    put<RatingResult>(`/movies/${slug}/rating`, { score }),
  postReport: (input: ReportInput) => post<{ id: string }>("/reports", input),
};
