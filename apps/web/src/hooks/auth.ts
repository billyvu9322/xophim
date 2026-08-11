import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/apis/auth-api";
import { useGuestStore } from "../stores/guest-store";
import type {
  LoginPayload,
  MergeGuestPayload,
  RegisterPayload,
  UpdateProfilePayload,
} from "../apis/types/auth-types";

export const authKeys = {
  me: ["auth", "me"] as const,
};

// useAuth: returns the current user (null if logged out).
export function useAuth() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: authApi.me,
    staleTime: 60_000,
    retry: false,
  });
}

// useLogin: on success, prime the me cache directly.
export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: (user) => {
      qc.setQueryData(authKeys.me, user);
    },
  });
}

// useRegister: same pattern as login.
export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterPayload) => authApi.register(payload),
    onSuccess: (user) => {
      qc.setQueryData(authKeys.me, user);
    },
  });
}

// useLogout: clears the me cache after logout.
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      qc.setQueryData(authKeys.me, null);
      qc.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}

// useUpdateProfile: PATCH display name / avatar, then prime the me cache with
// the fresh user so the navbar + profile update immediately.
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) =>
      authApi.updateProfile(payload),
    onSuccess: (user) => {
      qc.setQueryData(authKeys.me, user);
    },
  });
}

// useMergeGuest: called right after login to merge guest localStorage data.
export function useMergeGuest() {
  return useMutation({
    mutationFn: (payload: MergeGuestPayload) => authApi.mergeGuest(payload),
  });
}

// useLoginWithGoogle: verify a Google access token (from the GIS implicit flow,
// useGoogleLogin) server-side → session cookie, then merge any guest data and
// prime the me cache.
export function useLoginWithGoogle() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (accessToken: string) => {
      const user = await authApi.loginWithGoogle(accessToken);

      const { watchlist, progress, clear } = useGuestStore.getState();
      if (watchlist.length > 0 || progress.length > 0) {
        await authApi.mergeGuest({ watchlist, progress });
        clear();
      }

      return user;
    },
    onSuccess: (user) => {
      qc.setQueryData(authKeys.me, user);
      qc.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}
