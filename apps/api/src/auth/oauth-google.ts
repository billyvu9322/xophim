import { createHash, randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";

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

// Verify a Google Identity Services ID token (from the `@react-oauth/google`
// <GoogleLogin> credential) and return the profile. Audience must match the
// client id the token was minted for. Throws on invalid/expired tokens.
const idTokenClients = new Map<string, OAuth2Client>();
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
): Promise<GoogleUserInfo> {
  let client = idTokenClients.get(clientId);
  if (!client) {
    client = new OAuth2Client(clientId);
    idTokenClients.set(clientId, client);
  }
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Google ID token missing sub/email");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
    picture: payload.picture ?? null,
  };
}

// Verify an OAuth access token BELONGS to our client before trusting the
// identity it unlocks. An access token minted for a different app must never be
// accepted (token/audience confusion) — /tokeninfo returns `aud`/`azp` which
// must equal our client id. Only then do we read the profile via userinfo.
export async function verifyGoogleAccessToken(
  accessToken: string,
  clientId: string,
): Promise<GoogleUserInfo> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!res.ok) {
    throw new Error(`Google tokeninfo failed: ${res.status}`);
  }
  const info = (await res.json()) as { aud?: string; azp?: string };
  if (info.aud !== clientId && info.azp !== clientId) {
    throw new Error("Google access token audience mismatch");
  }
  return fetchGoogleUserInfo(accessToken);
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
