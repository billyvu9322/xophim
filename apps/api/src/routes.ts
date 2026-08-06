import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { pingDb } from "./db/index.js";
import { registerCatalogRoutes } from "./catalog/routes.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { requireAuth } from "./auth/require-auth.js";
import { registerUserStateRoutes } from "./user-state/routes.js";
import { registerCommunityRoutes } from "./community/routes.js";
import { registerCollectionsRoutes } from "./collections/routes.js";
import { registerRoomsRoutes } from "./rooms/routes.js";

// All routes mount under /v1 (see app.ts). Feature modules register here.
export const registerRoutes: FastifyPluginAsyncZod = async (app) => {
  // Decorate requireAuth on the /v1 instance so every sub-plugin inherits it.
  app.decorate("requireAuth", requireAuth);

  await app.register(registerCatalogRoutes, { prefix: "/catalog" });
  await app.register(registerAuthRoutes, { prefix: "/auth" });
  await app.register(registerUserStateRoutes, { prefix: "/me" });
  await app.register(registerCommunityRoutes);
  await app.register(registerCollectionsRoutes, { prefix: "/collections" });
  await app.register(registerRoomsRoutes, { prefix: "/rooms" });

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: z.object({
            status: z.literal("ok"),
            db: z.enum(["up", "down"]),
          }),
        },
      },
    },
    async () => {
      let dbStatus: "up" | "down" = "up";
      try {
        await pingDb();
      } catch {
        dbStatus = "down";
      }
      return { status: "ok" as const, db: dbStatus };
    },
  );
};
