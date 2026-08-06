import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { db } from "../db/index.js";
import {
  buildAuthUrl,
  exchangeCode,
  fetchGoogleUserInfo,
  generatePkce,
  generateState,
} from "./oauth-google.js";
import { createSession, deleteSession, lookupSession } from "./session.js";
import { loginUser, mergeGuest, oauthLink, registerUser } from "./service.js";
import "./types.js"; // ensure module augmentation is loaded

const SID = "sid";
const OAUTH_STATE_COOKIE = "oauth_state";
const OAUTH_STATE_TTL_SEC = 60 * 10; // 10 minutes
const OAUTH_POPUP_MODE = "popup";

export function buildOAuthPopupSuccessHtml(origin: string): string {
  const targetOrigin = JSON.stringify(origin);
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>Đăng nhập Google</title>
  </head>
  <body>
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: "google-auth-success" }, ${targetOrigin});
      }
      window.close();
    </script>
    <p>Đăng nhập thành công. Bạn có thể đóng cửa sổ này.</p>
  </body>
</html>`;
}

function sidCookieOptions(ttlDays: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: ttlDays * 24 * 60 * 60,
  };
}

const userResponse = z.object({
  id: z.string(),
  username: z.string().nullable(),
  email: z.string(),
  role: z.string(),
});

export const registerAuthRoutes: FastifyPluginAsyncZod = async (app) => {
  // requireAuth is decorated on the parent /v1 instance (see routes.ts) and
  // inherited here, so `/auth/logout` and `/auth/merge-guest` can use it.

  // ------------------------------------------------------------------ //
  //  POST /register                                                      //
  // ------------------------------------------------------------------ //
  app.post(
    "/register",
    {
      schema: {
        body: z.object({
          username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
          email: z.string().email(),
          password: z.string().min(8).max(128),
        }),
        response: { 201: z.object({ user: userResponse }) },
      },
    },
    async (request, reply) => {
      const { user } = await registerUser(db, request.body);
      const sid = await createSession(db, {
        userId: user.id,
        ttlDays: app.env.SESSION_TTL_DAYS,
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });
      reply.setCookie(SID, sid, sidCookieOptions(app.env.SESSION_TTL_DAYS));
      return reply.code(201).send({ user });
    },
  );

  // ------------------------------------------------------------------ //
  //  POST /login                                                         //
  // ------------------------------------------------------------------ //
  app.post(
    "/login",
    {
      schema: {
        body: z.object({
          usernameOrEmail: z.string().min(1),
          password: z.string().min(1),
        }),
        response: { 200: z.object({ user: userResponse }) },
      },
    },
    async (request, reply) => {
      const user = await loginUser(db, request.body);
      const sid = await createSession(db, {
        userId: user.id,
        ttlDays: app.env.SESSION_TTL_DAYS,
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });
      reply.setCookie(SID, sid, sidCookieOptions(app.env.SESSION_TTL_DAYS));
      return reply.send({ user });
    },
  );

  // ------------------------------------------------------------------ //
  //  POST /logout  (requireAuth)                                         //
  // ------------------------------------------------------------------ //
  app.post("/logout", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const sid = request.cookies[SID];
    if (sid) await deleteSession(db, sid);
    reply.clearCookie(SID, { path: "/" });
    return reply.send({ ok: true });
  });

  // ------------------------------------------------------------------ //
  //  GET /me  — returns current user or null.                            //
  // ------------------------------------------------------------------ //
  app.get(
    "/me",
    {
      schema: {
        response: { 200: z.object({ user: userResponse.nullable() }) },
      },
    },
    async (request, reply) => {
      const sid = request.cookies[SID];
      if (!sid) return reply.send({ user: null });
      const user = await lookupSession(db, sid);
      return reply.send({ user: user ?? null });
    },
  );

  // ------------------------------------------------------------------ //
  //  GET /google  — redirect to Google OAuth                             //
  // ------------------------------------------------------------------ //
  app.get("/google", async (request, reply) => {
    const clientId = app.env.GOOGLE_CLIENT_ID;
    const redirectUri = app.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return reply.code(503).send({ error: "Google OAuth is not configured" });
    }

    const state = generateState();
    const { verifier, challenge } = generatePkce();

    // Store state + verifier in a short-lived httpOnly cookie; the callback
    // reads them back to verify. Value: `state:verifier` (neither has a colon).
    const query = request.query as { mode?: string };
    const mode = query.mode === OAUTH_POPUP_MODE ? OAUTH_POPUP_MODE : "redirect";

    reply.setCookie(OAUTH_STATE_COOKIE, `${state}:${verifier}:${mode}`, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_STATE_TTL_SEC,
    });

    const url = buildAuthUrl({ clientId, redirectUri, state, codeChallenge: challenge });
    return reply.redirect(url);
  });

  // ------------------------------------------------------------------ //
  //  GET /google/callback                                                 //
  // ------------------------------------------------------------------ //
  app.get(
    "/google/callback",
    { schema: { querystring: z.object({ code: z.string(), state: z.string() }) } },
    async (request, reply) => {
      const clientId = app.env.GOOGLE_CLIENT_ID;
      const clientSecret = app.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = app.env.GOOGLE_REDIRECT_URI;
      if (!clientId || !clientSecret || !redirectUri) {
        return reply.code(503).send({ error: "Google OAuth is not configured" });
      }

      // Verify state + extract verifier.
      const stateCookie = request.cookies[OAUTH_STATE_COOKIE] ?? "";
      const [storedState, verifier, mode] = stateCookie.split(":");
      if (!storedState || !verifier || storedState !== request.query.state) {
        return reply.code(400).send({ error: "Invalid OAuth state" });
      }
      reply.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

      const tokens = await exchangeCode({
        clientId,
        clientSecret,
        redirectUri,
        code: request.query.code,
        codeVerifier: verifier,
      });

      const googleUser = await fetchGoogleUserInfo(tokens.accessToken);

      const user = await oauthLink(db, {
        provider: "google",
        providerUid: googleUser.sub,
        email: googleUser.email,
        displayName: googleUser.name,
        avatarUrl: googleUser.picture,
      });

      const sid = await createSession(db, {
        userId: user.id,
        ttlDays: app.env.SESSION_TTL_DAYS,
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });
      reply.setCookie(SID, sid, sidCookieOptions(app.env.SESSION_TTL_DAYS));

      if (mode === OAUTH_POPUP_MODE) {
        return reply
          .type("text/html; charset=utf-8")
          .send(buildOAuthPopupSuccessHtml(app.env.WEB_ORIGIN));
      }

      return reply.redirect(app.env.WEB_ORIGIN);
    },
  );

  // ------------------------------------------------------------------ //
  //  POST /merge-guest  (requireAuth)                                    //
  // ------------------------------------------------------------------ //
  app.post(
    "/merge-guest",
    {
      preHandler: [app.requireAuth],
      schema: {
        body: z.object({
          watchlist: z
            .array(
              z.object({
                movieSlug: z.string(),
                movieSnapshot: z.record(z.unknown()),
                createdAt: z.string().datetime(),
              }),
            )
            .default([]),
          progress: z
            .array(
              z.object({
                movieSlug: z.string(),
                episodeSlug: z.string(),
                serverName: z.string(),
                positionSec: z.number().int().nonnegative(),
                durationSec: z.number().int().nonnegative().nullable(),
                movieSnapshot: z.record(z.unknown()),
                updatedAt: z.string().datetime(),
              }),
            )
            .default([]),
        }),
        response: {
          200: z.object({
            watchlistMerged: z.number(),
            progressMerged: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const result = await mergeGuest(db, {
        userId: user.id,
        watchlist: request.body.watchlist,
        progress: request.body.progress,
      });
      return reply.send(result);
    },
  );
};
