import { cleanupHlsPlaylist, firstVariantUri } from "../lib/playlist-cleanup";

// Content-types an HLS playlist may legitimately be served as. text/plain is
// tolerated too (many CDNs mislabel .m3u8). Anything else = not a playlist.
const PLAYLIST_CONTENT_TYPES = new Set([
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "audio/mpegurl",
]);

const FETCH_TIMEOUT_MS = 10_000;

async function fetchPlaylist(url: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(url, {
    signal,
    headers: { accept: "application/vnd.apple.mpegurl,application/x-mpegurl,text/plain,*/*" },
  });
  if (!res.ok) throw new Error(`Playlist upstream returned ${res.status}`);
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType && !PLAYLIST_CONTENT_TYPES.has(contentType) && contentType !== "text/plain") {
    throw new Error("URL did not return an HLS playlist");
  }
  return res.text();
}

// Fetch + strip the playlist entirely in the browser. The end user's device is
// on a domestic (VN) network, so it is not subject to the CDN geo-block that
// rejects the server's datacenter egress. Ads live in the MEDIA playlist, so if
// the URL points at a master playlist we follow it to the variant first, then
// strip — returning a media playlist with absolute segment URLs so the player
// never re-fetches the ad-laden original. On any failure the caller
// (VideoPlayer) falls back to the original src.
export async function cleanupPlaylist(linkM3U8: string, signal?: AbortSignal): Promise<string> {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const combined =
    signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([signal, timeout])
      : (signal ?? timeout);

  const playlist = await fetchPlaylist(linkM3U8, combined);

  // Master playlist → follow the first variant to reach the segment list where
  // the ads actually are.
  const variant = firstVariantUri(playlist);
  if (variant) {
    const variantUrl = new URL(variant, linkM3U8).toString();
    const media = await fetchPlaylist(variantUrl, combined);
    return cleanupHlsPlaylist(media, variantUrl);
  }

  return cleanupHlsPlaylist(playlist, linkM3U8);
}
