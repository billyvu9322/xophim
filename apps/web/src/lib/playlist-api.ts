import { api } from "./api";

export async function cleanupPlaylist(linkM3U8: string, signal?: AbortSignal): Promise<string> {
  const res = await api.post<{ content: string }>("/playlist/cleanup", { linkM3U8 }, {
    signal,
    timeout: 10_000,
  });
  return res.data.content;
}
