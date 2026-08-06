import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../lib/auth-api";
import type { LoginPayload, MergeGuestPayload, RegisterPayload } from "../lib/auth-types";

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

// useMergeGuest: called right after login to merge guest localStorage data.
export function useMergeGuest() {
  return useMutation({
    mutationFn: (payload: MergeGuestPayload) => authApi.mergeGuest(payload),
  });
}
