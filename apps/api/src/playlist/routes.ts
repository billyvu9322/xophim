import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { cleanupHlsPlaylist, isAllowedPlaylistHost } from "./cleanup.js";

const cleanupQuerySchema = z.object({
  linkM3U8: z.string().url(),
});
const cleanupBodySchema = cleanupQuerySchema;

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

const playlistContentTypes = new Set([
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "audio/mpegurl",
]);

export const registerPlaylistRoutes: FastifyPluginAsyncZod = async (app) => {
  const responseSchema = {
    200: z.object({ content: z.string() }),
    403: errorResponseSchema,
    424: errorResponseSchema,
    415: errorResponseSchema,
  };

  async function cleanup(linkM3U8: string, req: FastifyRequest, reply: FastifyReply) {
      if (!isAllowedPlaylistHost(linkM3U8, app.env.PLAYLIST_CLEANUP_ALLOWED_HOSTS)) {
        return reply
          .code(403)
          .send({ error: "Forbidden", message: "Playlist host is not allowed" });
      }

      let upstream: Response;
      try {
        upstream = await fetch(linkM3U8, {
          signal: AbortSignal.timeout(10_000),
          headers: {
            accept: "application/vnd.apple.mpegurl,application/x-mpegurl,text/plain,*/*",
            "accept-language": "en-US,en;q=0.9,vi;q=0.8",
            "cache-control": "no-cache",
            pragma: "no-cache",
            referer: `${new URL(linkM3U8).origin}/`,
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
          },
        });
      } catch (error) {
        req.log.warn({ err: error, linkM3U8 }, "Playlist upstream fetch failed");
        return reply
          .code(424)
          .send({ error: "UpstreamError", message: "Playlist upstream request failed" });
      }
      if (!upstream.ok) {
        req.log.warn(
          { linkM3U8, upstreamStatus: upstream.status, upstreamStatusText: upstream.statusText },
          "Playlist upstream returned non-OK status",
        );
        return reply
          .code(424)
          .send({ error: "UpstreamError", message: `Playlist upstream returned ${upstream.status}` });
      }

      const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
      if (contentType && !playlistContentTypes.has(contentType) && contentType !== "text/plain") {
        return reply
          .code(415)
          .send({ error: "UnsupportedMediaType", message: "URL did not return an HLS playlist" });
      }

      const playlist = await upstream.text();
      return { content: cleanupHlsPlaylist(playlist, linkM3U8) };
  }

  app.get(
    "/cleanup",
    {
      schema: {
        querystring: cleanupQuerySchema,
        response: responseSchema,
      },
    },
    async (req, reply) => cleanup(req.query.linkM3U8, req, reply),
  );

  app.post(
    "/cleanup",
    {
      schema: {
        body: cleanupBodySchema,
        response: responseSchema,
      },
    },
    async (req, reply) => cleanup(req.body.linkM3U8, req, reply),
  );
};
