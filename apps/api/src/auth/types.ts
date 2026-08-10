// The shape attached to request.user after requireAuth runs.
export interface AuthUser {
  id: string;
  role: string;
  username: string | null;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

// Module augmentation so request.user and app.requireAuth are typed globally.
// FastifyRequest/FastifyReply resolve within the augmented module's own scope,
// so no import is needed here (importing them would be flagged as unused).
declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
  interface FastifyInstance {
    requireAuth: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}
