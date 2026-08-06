import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../lib/auth-api";
import { useGuestStore } from "../lib/guest-store";
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

function waitForGooglePopup(): Promise<void> {
  const width = 500;
  const height = 640;
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
  const popup = window.open(
    "/v1/auth/google?mode=popup",
    "google-login",
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
  );

  if (!popup) {
    window.location.href = "/v1/auth/google";
    return Promise.reject(new Error("Trình duyệt đã chặn cửa sổ đăng nhập Google"));
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Đăng nhập Google mất quá lâu, vui lòng thử lại"));
    }, 120_000);

    const closedCheck = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("Bạn đã đóng cửa sổ đăng nhập Google"));
      }
    }, 500);

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.clearInterval(closedCheck);
      window.removeEventListener("message", onMessage);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if ((event.data as { type?: string })?.type !== "google-auth-success") return;

      cleanup();
      popup.close();
      resolve();
    };

    window.addEventListener("message", onMessage);
  });
}

export function useGooglePopupLogin() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await waitForGooglePopup();
      const user = await authApi.me();
      if (!user) throw new Error("Đăng nhập Google thất bại, vui lòng thử lại");

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
