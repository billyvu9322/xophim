import { api } from "./api";
import type {
  AuthUser,
  LoginPayload,
  MergeGuestPayload,
  MergeGuestResult,
  RegisterPayload,
} from "./auth-types";

export const authApi = {
  // GET /v1/auth/me — returns user or null; never throws 401.
  me: async (): Promise<AuthUser | null> => {
    const res = await api.get<{ user: AuthUser | null }>("/auth/me");
    return res.data.user;
  },

  // POST /v1/auth/register — creates user + session, sets sid cookie.
  register: async (payload: RegisterPayload): Promise<AuthUser> => {
    const res = await api.post<{ user: AuthUser }>("/auth/register", payload);
    return res.data.user;
  },

  // POST /v1/auth/login — verifies credentials + creates session, sets sid cookie.
  login: async (payload: LoginPayload): Promise<AuthUser> => {
    const res = await api.post<{ user: AuthUser }>("/auth/login", payload);
    return res.data.user;
  },

  // POST /v1/auth/google — verifies a Google access token (from the GIS implicit
  // flow, useGoogleLogin) server-side and creates a session.
  loginWithGoogle: async (accessToken: string): Promise<AuthUser> => {
    const res = await api.post<{ user: AuthUser }>("/auth/google", { accessToken });
    return res.data.user;
  },

  // POST /v1/auth/logout — clears the session; throws if not authenticated.
  logout: async (): Promise<void> => {
    await api.post("/auth/logout");
  },

  // POST /v1/auth/merge-guest — merges guest localStorage state after login.
  mergeGuest: async (payload: MergeGuestPayload): Promise<MergeGuestResult> => {
    const res = await api.post<MergeGuestResult>("/auth/merge-guest", payload);
    return res.data;
  },
};
