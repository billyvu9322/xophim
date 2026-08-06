import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "../lib/collections-api";
import type { CollectionItemInput, CollectionWriteInput } from "../lib/collections-types";

export const collectionsKeys = {
  all: ["collections"] as const,
  detail: (slug: string) => ["collections", "detail", slug] as const,
};

/** All published collections. */
export const useCollections = () =>
  useQuery({
    queryKey: collectionsKeys.all,
    queryFn: collectionsApi.list,
    staleTime: 5 * 60_000,
  });

/** A single published collection with enriched items. */
export const useCollection = (slug: string) =>
  useQuery({
    queryKey: collectionsKeys.detail(slug),
    queryFn: () => collectionsApi.detail(slug),
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });

// Admin mutations — only meaningful for admins; the API enforces the guard.

/** Create (no id) or update (with id) a collection. */
export const useUpsertCollection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id?: string;
      body: CollectionWriteInput | Partial<CollectionWriteInput>;
    }) =>
      id
        ? collectionsApi.updateCollection(id, body as Partial<CollectionWriteInput>)
        : collectionsApi.createCollection(body as CollectionWriteInput),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: collectionsKeys.all });
    },
  });
};

export const useDeleteCollection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => collectionsApi.deleteCollection(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: collectionsKeys.all });
    },
  });
};

export const useUpsertCollectionItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      collectionId,
      movieSlug,
      body,
    }: {
      collectionId: string;
      movieSlug: string;
      body: CollectionItemInput;
    }) => collectionsApi.upsertItem(collectionId, movieSlug, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["collections", "detail"] });
      void qc.invalidateQueries({ queryKey: collectionsKeys.all });
    },
  });
};

export const useRemoveCollectionItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, movieSlug }: { collectionId: string; movieSlug: string }) =>
      collectionsApi.removeItem(collectionId, movieSlug),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["collections", "detail"] });
    },
  });
};
