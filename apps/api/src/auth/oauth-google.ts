import { createHash, randomBytes } from "node:crypto";

// ---------- PKCE helpers ----------

export function generateState(): string {
  return randomBytes(32).toString("hex");
}

export function generatePkce(): { verifier: string; challenge: string } {
  // verifier: 32 random bytes → base64url (43 chars, well within 128 limit).
  const verifier = randomBytes(32).toString("base64url").replace(/=/g, "");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url")
    .replace(/=/g, "");
  return { verifier, challenge };
}

// ---------- Authorization URL ----------

interface BuildAuthUrlOpts {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

export function buildAuthUrl(opts: BuildAuthUrlOpts): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ---------- Token exchange ----------

export interface GoogleTokens {
  accessToken: string;
  idToken: string;
}

export interface GoogleUserInfo {
  sub: string; // Provider uid — the stable Google user identifier.
  email: string;
  name: string;
  picture: string | null;
}

export async function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    code: opts.code,
    code_verifier: opts.codeVerifier,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { access_token: string; id_token: string };
  return { accessToken: json.access_token, idToken: json.id_token };
}

export async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  };
  return {
    sub: json.sub,
    email: json.email,
    name: json.name ?? json.email,
    picture: json.picture ?? null,
  };
}
