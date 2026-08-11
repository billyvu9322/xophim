import { api } from "./api";
import type {
  Collection,
  CollectionDetail,
  CollectionItemInput,
  CollectionWriteInput,
} from "./types/collections-types";

const get = async <T>(url: string): Promise<T> => (await api.get<T>(url)).data;
const post = async <T>(url: string, data: unknown): Promise<T> =>
  (await api.post<T>(url, data)).data;
const patch = async <T>(url: string, data: unknown): Promise<T> =>
  (await api.patch<T>(url, data)).data;
const put = async <T>(url: string, data: unknown): Promise<T> =>
  (await api.put<T>(url, data)).data;
const del = async (url: string): Promise<void> => {
  await api.delete(url);
};

export const collectionsApi = {
  // Public
  list: () => get<Collection[]>("/collections"),
  detail: (slug: string) => get<CollectionDetail>(`/collections/${slug}`),

  // Admin — server enforces role === 'admin'.
  createCollection: (body: CollectionWriteInput) =>
    post<{ id: string }>("/collections", body),
  updateCollection: (id: string, body: Partial<CollectionWriteInput>) =>
    patch<{ id: string }>(`/collections/${id}`, body),
  deleteCollection: (id: string) => del(`/collections/${id}`),
  upsertItem: (
    collectionId: string,
    movieSlug: string,
    body: CollectionItemInput,
  ) =>
    put<{ ok: boolean }>(
      `/collections/${collectionId}/items/${movieSlug}`,
      body,
    ),
  removeItem: (collectionId: string, movieSlug: string) =>
    del(`/collections/${collectionId}/items/${movieSlug}`),
};
