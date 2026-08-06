import { eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { randomBytes } from "node:crypto";
import { z } from "zod";

import { readOptionalUser } from "../auth/optional-auth.js";
import { rooms } from "../db/schema/index.js";
import { roomManager } from "./RoomManager.js";
import type { ClientMessage, ServerMessage } from "./types.js";
import "../auth/types.js"; // request.user augmentation

// Unique-ish 6-char uppercase invite code.
function generateCode(): string {
  return randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
}

export const registerRoomsRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /v1/rooms — requireAuth; creator becomes host.
  app.post(
    "/",
    {
      preHandler: [app.requireAuth],
      schema: {
        body: z.object({ slug: z.string().min(1), episodeSlug: z.string().min(1) }),
        response: {
          201: z.object({
            id: z.string().uuid(),
            code: z.string(),
            movieSlug: z.string(),
            episodeSlug: z.string(),
            createdAt: z.string(),
          }),
          500: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const hostUserId = request.user!.id;
      const { slug, episodeSlug } = request.body;

      let room: typeof rooms.$inferSelect | undefined;
      for (let attempt = 0; attempt < 5 && !room; attempt += 1) {
        const code = generateCode();
        try {
          const [inserted] = await app.db
            .insert(rooms)
            .values({ code, hostUserId, movieSlug: slug, episodeSlug })
            .returning();
          room = inserted;
        } catch (err) {
          // Unique-violation on `code` → retry; rethrow anything else.
          if ((err as { code?: string }).code !== "23505") throw err;
        }
      }
      if (!room) {
        return reply
          .code(500)
          .send({ error: "InternalServerError", message: "Could not generate a unique room code" });
      }

      return reply.code(201).send({
        id: room.id,
        code: room.code,
        movieSlug: room.movieSlug,
        episodeSlug: room.episodeSlug,
        createdAt: room.createdAt.toISOString(),
      });
    },
  );

  // GET /v1/rooms/:code — public; metadata + live member count.
  app.get(
    "/:code",
    {
      schema: {
        params: z.object({ code: z.string().length(6) }),
        response: {
          200: z.object({
            id: z.string().uuid(),
            code: z.string(),
            movieSlug: z.string(),
            episodeSlug: z.string(),
            memberCount: z.number().int(),
            createdAt: z.string(),
            closedAt: z.string().nullable(),
          }),
          404: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const [room] = await app.db
        .select()
        .from(rooms)
        .where(eq(rooms.code, request.params.code))
        .limit(1);
      if (!room) {
        return reply.code(404).send({ error: "NotFound", message: `Room not found` });
      }
      const memberCount = roomManager.getRuntime(room.code)?.members.size ?? 0;
      return reply.code(200).send({
        id: room.id,
        code: room.code,
        movieSlug: room.movieSlug,
        episodeSlug: room.episodeSlug,
        memberCount,
        createdAt: room.createdAt.toISOString(),
        closedAt: room.closedAt?.toISOString() ?? null,
      });
    },
  );

  // WS /v1/rooms/:code/ws — realtime sync. Thin adapter over RoomManager.
  // Client must send {type:"join",name} first (within 5s) or the socket closes.
  // Host = the connected session user whose id matches room.hostUserId. Guests
  // (no session) connect as viewers (isHost=false).
  app.get("/:code/ws", { websocket: true }, async (socket, request) => {
    const { code } = request.params as { code: string };

    const [room] = await app.db.select().from(rooms).where(eq(rooms.code, code)).limit(1);
    if (!room || room.closedAt) {
      socket.close(4004, "Room not found or closed");
      return;
    }

    const optUser = await readOptionalUser(app.db, request.cookies?.sid);
    const isHost = !!optUser && optUser.id === room.hostUserId;
    const memberId = randomBytes(8).toString("hex");

    const send = (msg: ServerMessage) => {
      try {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
      } catch {
        // ignore sends on a closed socket
      }
    };

    let joined = false;
    const joinTimeout = setTimeout(() => {
      if (!joined) socket.close(4008, "Join timeout");
    }, 5000);

    socket.on("message", (raw: Buffer | string) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return;
      }

      if (!joined) {
        if (msg.type !== "join") return;
        clearTimeout(joinTimeout);
        joined = true;
        const name = String(msg.name ?? "Khách").slice(0, 64);
        roomManager.join(code, room.hostUserId, { memberId, name, isHost, send });
        return;
      }

      switch (msg.type) {
        case "play":
        case "pause":
        case "seek":
          roomManager.applyHostAction(code, memberId, msg);
          break;
        case "chat": {
          const text = String(msg.text ?? "").slice(0, 500).trim();
          if (text) roomManager.chat(code, memberId, text);
          break;
        }
        default:
          break;
      }
    });

    socket.on("close", () => {
      clearTimeout(joinTimeout);
      if (joined) roomManager.leave(code, memberId);
    });
    socket.on("error", () => {
      clearTimeout(joinTimeout);
      if (joined) roomManager.leave(code, memberId);
    });
  });
};
