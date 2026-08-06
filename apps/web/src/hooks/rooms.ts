import { useMutation, useQuery } from "@tanstack/react-query";
import { roomsApi } from "../lib/rooms-api";

// Create a watch-party room (host = current user). Requires auth server-side.
export function useCreateRoom() {
  return useMutation({
    mutationFn: ({ slug, episodeSlug }: { slug: string; episodeSlug: string }) =>
      roomsApi.create(slug, episodeSlug),
  });
}

// Fetch room metadata by invite code.
export function useRoom(code: string) {
  return useQuery({
    queryKey: ["room", code],
    queryFn: () => roomsApi.get(code),
    enabled: !!code,
    retry: false,
  });
}
