import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { ZodError } from "zod";

import { env, type AppEnv } from "./config/env.js";
import { db, type Database } from "./db/index.js";
import { registerRoutes } from "./routes.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    env: AppEnv;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug"),
      transport:
        env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    },
    bodyLimit: 32 * 1024 * 1024,
    genReqId: () => randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.decorate("env", env);
  app.decorate("db", db);

  // Zod is the single source of truth for request/response I/O.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Plugins. credentials:true (cookies) needs an explicit origin allow-list.
  // COOP defaults to "same-origin", which severs window.opener for OAuth popups
  // (Google Identity Services returns the token via the opener). Relax it so the
  // GIS sign-in popup can post its result back; isolation is otherwise preserved.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  });
  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  // WebSocket support for Watch Party rooms (Phase 6). Must be registered
  // before any route that declares `{ websocket: true }`.
  await app.register(fastifyWebsocket);

  // Centralized error handler: ZodError -> 400, any 4xx statusCode passthrough,
  // everything else -> 500 (generic message in production).
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply
        .code(400)
        .send({ error: "ValidationError", issues: error.flatten() });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      const clientError = error as Error;
      return reply
        .code(status)
        .send({ error: clientError.name, message: clientError.message });
    }
    request.log.error(
      { err: error, method: request.method, url: request.url },
      `Unhandled error: ${(error as Error).message}`,
    );
    const body =
      env.NODE_ENV === "production"
        ? { error: "InternalServerError", message: "Something went wrong" }
        : {
            error: (error as Error).name || "InternalServerError",
            message: (error as Error).message,
          };
    return reply.code(500).send(body);
  });

  // Routes (all under /v1).
  await app.register(registerRoutes, { prefix: "/v1" });

  // Single-container image: the API also serves the built SPA when configured.
  if (env.WEB_STATIC_DIR && existsSync(env.WEB_STATIC_DIR)) {
    const fastifyStatic = (await import("@fastify/static")).default;
    await app.register(fastifyStatic, {
      root: env.WEB_STATIC_DIR,
      wildcard: false,
    });
    // SPA fallback: serve index.html for client routes; keep API/asset 404s clean.
    app.setNotFoundHandler((request, reply) => {
      if (
        request.method === "GET" &&
        !request.url.startsWith("/v1") &&
        !request.url.startsWith("/assets/")
      ) {
        return reply.sendFile("index.html");
      }
      return reply
        .code(404)
        .send({ error: "NotFound", message: "Route not found" });
    });
  }

  return app;
}
