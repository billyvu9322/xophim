import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as schema from "../src/db/schema/index.js";

// Swap the db singleton for a pg-mem instance BEFORE any module that imports it
// loads. The factory builds the mem DB once; importing `db` below yields that
// same instance so tests can reset tables between runs.
vi.mock("../src/db/index.js", async () => {
  const { buildMemDb } = await import("./helpers/memdb.js");
  const db = await buildMemDb();
  return { db, pingDb: async () => {} };
});

const { db: memDb } = await import("../src/db/index.js");

let app: Awaited<ReturnType<typeof import("../src/app.js").buildApp>>;

beforeAll(async () => {
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await memDb.delete(schema.sessions);
  await memDb.delete(schema.oauthAccounts);
  await memDb.delete(schema.users);
});

async function register(body: { username: string; email: string; password: string }) {
  return app.inject({ method: "POST", url: "/v1/auth/register", payload: body });
}

function extractSid(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : [String(setCookie ?? "")];
  const sidEntry = cookies.find((c) => String(c).startsWith("sid="));
  if (!sidEntry) throw new Error("No sid cookie in response");
  return String(sidEntry).split(";")[0]!.replace("sid=", "");
}

describe("POST /v1/auth/register", () => {
  it("creates a user and sets a sid cookie", async () => {
    const res = await register({
      username: "alice",
      email: "alice@example.com",
      password: "password123",
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe("alice@example.com");
    expect(body.user.username).toBe("alice");
    expect(extractSid(res).length).toBe(64);
  });

  it("rejects duplicate email with 409", async () => {
    await register({ username: "dupuser1", email: "dup@example.com", password: "password123" });
    const res = await register({ username: "dupuser2", email: "dup@example.com", password: "password456" });
    expect(res.statusCode).toBe(409);
  });

  it("rejects a short password with 400", async () => {
    const res = await register({ username: "bob", email: "bob@example.com", password: "short" });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/auth/login", () => {
  beforeEach(async () => {
    await register({ username: "carol", email: "carol@example.com", password: "mypassword123" });
  });

  it("logs in by email and sets sid cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { usernameOrEmail: "carol@example.com", password: "mypassword123" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe("carol@example.com");
    expect(extractSid(res).length).toBe(64);
  });

  it("logs in by username", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { usernameOrEmail: "carol", password: "mypassword123" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects wrong password with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { usernameOrEmail: "carol@example.com", password: "wrongpassword" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /v1/auth/me", () => {
  it("returns user:null when no cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/auth/me" });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toBeNull();
  });

  it("returns the user for a valid sid cookie", async () => {
    const regRes = await register({ username: "eve", email: "eve@example.com", password: "evespass123" });
    const sid = extractSid(regRes);
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { cookie: `sid=${sid}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe("eve@example.com");
  });
});

describe("Google OAuth popup mode", () => {
  it("stores popup mode in the OAuth state cookie", async () => {
    Object.assign(app.env, {
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_REDIRECT_URI: "http://localhost:5243/v1/auth/google/callback",
    });

    const res = await app.inject({ method: "GET", url: "/v1/auth/google?mode=popup" });
    expect(res.statusCode).toBe(302);

    const setCookie = res.headers["set-cookie"];
    const cookies = Array.isArray(setCookie) ? setCookie : [String(setCookie ?? "")];
    const stateCookie = cookies.find((c) => String(c).startsWith("oauth_state="));

    expect(stateCookie).toContain(":popup");
  });

  it("builds a popup success page that notifies the opener and closes", async () => {
    const { buildOAuthPopupSuccessHtml } = await import("../src/auth/routes.js");

    const html = buildOAuthPopupSuccessHtml("http://localhost:5173");

    expect(html).toContain("window.opener.postMessage");
    expect(html).toContain("google-auth-success");
    expect(html).toContain("http://localhost:5173");
    expect(html).toContain("window.close()");
  });
});

describe("requireAuth guard + logout", () => {
  it("returns 401 with no sid cookie", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/logout" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Unauthorized");
  });

  it("returns 401 for a garbage sid", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { cookie: `sid=${"0".repeat(64)}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("logs out a valid session; the sid is then unusable", async () => {
    const regRes = await register({ username: "dave", email: "dave@example.com", password: "pass12345" });
    const sid = extractSid(regRes);

    const logoutRes = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { cookie: `sid=${sid}` },
    });
    expect(logoutRes.statusCode).toBe(200);

    const meRes = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { cookie: `sid=${sid}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user).toBeNull();
  });
});
