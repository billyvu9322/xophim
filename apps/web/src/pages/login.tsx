import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { AuthCard } from "@/components/AuthCard";
import { GoogleLoginButton } from "@/components/GoogleLoginButton";
import { Button } from "@/components/ui/Button";
import {
  useAuth,
  useLogin,
  useLoginWithGoogle,
  useMergeGuest,
} from "@/hooks/auth";
import { useGuestStore } from "@/lib/guest-store";
import { cn } from "@/lib/utils";

export function LoginPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const loginMutation = useLogin();
  const mergeGuestMutation = useMergeGuest();
  const googleLogin = useLoginWithGoogle();

  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (auth.data) {
      void navigate({ to: "/" });
    }
  }, [auth.data, navigate]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    try {
      await loginMutation.mutateAsync({ usernameOrEmail, password });

      // Merge guest data if any
      const { watchlist, progress, clear } = useGuestStore.getState();
      if (watchlist.length > 0 || progress.length > 0) {
        mergeGuestMutation.mutate({ watchlist, progress });
        clear();
      }

      void navigate({ to: "/" });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Đăng nhập thất bại";
      setError(message);
    }
  }

  function handleGoogle(credential?: string) {
    if (!credential) {
      setError("Đăng nhập Google thất bại");
      return;
    }
    setError(null);
    googleLogin.mutate(credential, {
      onSuccess: () => void navigate({ to: "/" }),
      onError: () => setError("Đăng nhập Google thất bại"),
    });
  }

  const isLoading = loginMutation.isPending;

  return (
    <AuthCard heading="Đăng Nhập">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {/* Username or Email */}
        <div className="space-y-1.5">
          <label className="block text-sm text-silver">
            Email / Tên đăng nhập
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              placeholder="Nhập email của bạn"
              required
              className="h-11 w-full rounded-md bg-elevated pl-10 pr-3 text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="block text-sm text-silver">Mật khẩu</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              required
              className="h-11 w-full rounded-md bg-elevated pl-10 pr-10 text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-silver"
              tabIndex={-1}
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Remember me + Forgot password */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-silver cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className={cn(
                "h-4 w-4 rounded border-slate bg-elevated accent-gold cursor-pointer",
              )}
            />
            Ghi nhớ đăng nhập
          </label>
          <a href="#" className="text-sm text-gold hover:brightness-110">
            Quên mật khẩu?
          </a>
        </div>

        {/* Inline error */}
        {error !== null && <p className="text-[#FC887B] text-sm">{error}</p>}

        {/* Submit */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={isLoading}
        >
          {isLoading ? "Đang đăng nhập..." : "Đăng Nhập"}
        </Button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-slate" />
        <span className="text-muted text-xs">hoặc</span>
        <div className="flex-1 border-t border-slate" />
      </div>

      {/* Google SSO — custom pill over the GSI credential button (ID token),
          verified server-side. */}
      <GoogleLoginButton
        onCredential={handleGoogle}
        onError={() => setError("Đăng nhập Google thất bại")}
        pending={googleLogin.isPending}
      />

      {/* Footer switch */}
      <p className="text-sm text-muted text-center">
        Chưa có tài khoản?{" "}
        <Link to="/dang-ky" className="text-gold hover:brightness-110">
          Đăng ký
        </Link>
      </p>
    </AuthCard>
  );
}
