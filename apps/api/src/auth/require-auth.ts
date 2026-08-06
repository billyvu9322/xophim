import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/index.js";
import { lookupSession } from "./session.js";
import "./types.js"; // load the FastifyRequest.user / FastifyInstance.requireAuth augmentation

// Shared requireAuth preHandler. Decorated onto the /v1 instance (see routes.ts)
// so every sub-plugin (auth, user-state, community, …) inherits it. Reads the
// `sid` cookie, looks up a non-expired session, and attaches request.user — or
// replies 401.
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const sid = request.cookies["sid"];
  if (!sid) {
    await reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  const user = await lookupSession(db, sid);
  if (!user) {
    await reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  request.user = user;
}
