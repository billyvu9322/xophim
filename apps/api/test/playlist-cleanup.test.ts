import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupHlsPlaylist } from "../src/playlist/cleanup.js";

describe("cleanupHlsPlaylist", () => {
  it("removes segments inside CUE-OUT/CUE-IN ad breaks", () => {
    const input = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.000,
content-1.ts
#EXT-X-CUE-OUT:DURATION=12
#EXTINF:6.000,
ad-1.ts
#EXTINF:6.000,
ad-2.ts
#EXT-X-CUE-IN
#EXTINF:6.000,
content-2.ts
#EXT-X-ENDLIST
`;

    expect(cleanupHlsPlaylist(input, "https://cdn.example.com/hls/index.m3u8"))
      .toBe(`#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.000,
https://cdn.example.com/hls/content-1.ts
#EXTINF:6.000,
https://cdn.example.com/hls/content-2.ts
#EXT-X-ENDLIST`);
  });

  it("removes HLS interstitial daterange tags without dropping content", () => {
    const input = `#EXTM3U
#EXT-X-DATERANGE:ID="ad-1",CLASS="com.apple.hls.interstitial",START-DATE="2026-08-08T00:00:00Z",DURATION=30
#EXTINF:4.000,
segment.ts
`;

    expect(cleanupHlsPlaylist(input, "https://cdn.example.com/live/main.m3u8"))
      .toBe(`#EXTM3U
#EXTINF:4.000,
https://cdn.example.com/live/segment.ts`);
  });
});

describe("GET /v1/playlist/cleanup", () => {
  let app: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>;

  beforeAll(async () => {
    process.env.PLAYLIST_CLEANUP_ALLOWED_HOSTS = "cdn.example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(`#EXTM3U\n#EXTINF:4.000,\nvideo.ts\n`, {
          status: 200,
          headers: { "content-type": "application/vnd.apple.mpegurl" },
        }),
      ),
    );
    const { buildApp } = await import("../src/app.js");
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  it("returns cleaned playlist text for allowlisted hosts", async () => {
    const res = await app.inject({
      url: "/v1/playlist/cleanup?linkM3U8=https%3A%2F%2Fcdn.example.com%2Fmovie%2Findex.m3u8",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      content: "#EXTM3U\n#EXTINF:4.000,\nhttps://cdn.example.com/movie/video.ts",
    });
  });

  it("accepts POST JSON and fetches the exact submitted playlist URL", async () => {
    const url = "https://cdn.example.com/movie/index.m3u8?token=a%2Fb&expires=123";
    const res = await app.inject({
      method: "POST",
      url: "/v1/playlist/cleanup",
      payload: { linkM3U8: url },
    });

    expect(res.statusCode).toBe(200);
    expect(fetch).toHaveBeenLastCalledWith(
      url,
      expect.objectContaining({ headers: expect.objectContaining({ referer: "https://cdn.example.com/" }) }),
    );
  });

  it("rejects hosts outside the cleanup allowlist", async () => {
    const res = await app.inject({
      url: "/v1/playlist/cleanup?linkM3U8=https%3A%2F%2Fblocked.example.com%2Findex.m3u8",
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns a controlled 424 when upstream fetch fails", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("upstream timeout"));

    const res = await app.inject({
      url: "/v1/playlist/cleanup?linkM3U8=https%3A%2F%2Fcdn.example.com%2Fmovie%2Findex.m3u8",
    });

    expect(res.statusCode).toBe(424);
    expect(res.json()).toEqual({
      error: "UpstreamError",
      message: "Playlist upstream request failed",
    });
  });

  it("returns upstream status details when the playlist host rejects the request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("forbidden", { status: 403 }));

    const res = await app.inject({
      url: "/v1/playlist/cleanup?linkM3U8=https%3A%2F%2Fcdn.example.com%2Fmovie%2Findex.m3u8",
    });

    expect(res.statusCode).toBe(424);
    expect(res.json()).toEqual({
      error: "UpstreamError",
      message: "Playlist upstream returned 403",
    });
  });
});
