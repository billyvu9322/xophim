import { api } from "./api";

export interface RoomCreateResult {
  id: string;
  code: string;
  movieSlug: string;
  episodeSlug: string;
  createdAt: string;
}

export interface RoomInfo {
  id: string;
  code: string;
  movieSlug: string;
  episodeSlug: string;
  memberCount: number;
  createdAt: string;
  closedAt: string | null;
}

export const roomsApi = {
  // POST /v1/rooms — requires auth; caller becomes host.
  create: async (slug: string, episodeSlug: string): Promise<RoomCreateResult> => {
    const res = await api.post<RoomCreateResult>("/rooms", { slug, episodeSlug });
    return res.data;
  },
  // GET /v1/rooms/:code — public metadata + live member count.
  get: async (code: string): Promise<RoomInfo> => {
    const res = await api.get<RoomInfo>(`/rooms/${code}`);
    return res.data;
  },
};
