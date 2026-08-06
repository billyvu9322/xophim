import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { AuthCard } from "@/components/AuthCard";
import { Button } from "@/components/ui/Button";
import { useAuth, useGooglePopupLogin, useLogin, useMergeGuest } from "@/hooks/auth";
import { useGuestStore } from "@/lib/guest-store";
import { cn } from "@/lib/utils";

// Inline multicolor Google "G" SVG
function GoogleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const loginMutation = useLogin();
  const mergeGuestMutation = useMergeGuest();
  const googleLoginMutation = useGooglePopupLogin();

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
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Đăng nhập thất bại";
      setError(message);
    }
  }

  const isLoading = loginMutation.isPending;
  const isGoogleLoading = googleLoginMutation.isPending;

  return (
    <AuthCard heading="Đăng Nhập">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {/* Username or Email */}
        <div className="space-y-1.5">
          <label className="block text-sm text-silver">Tên đăng nhập hoặc Email</label>
          <input
            type="text"
            value={usernameOrEmail}
            onChange={(e) => setUsernameOrEmail(e.target.value)}
            placeholder="Nhập tên đăng nhập hoặc email"
            required
            className="w-full h-11 px-3 bg-elevated rounded-md text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="block text-sm text-silver">Mật khẩu</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              required
              className="w-full h-11 px-3 pr-10 bg-elevated rounded-md text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-silver"
              tabIndex={-1}
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
        {error !== null && (
          <p className="text-[#FC887B] text-sm">{error}</p>
        )}

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

      {/* Google SSO */}
      <button
        type="button"
        onClick={() => {
          setError(null);
          googleLoginMutation.mutate(undefined, {
            onSuccess: () => void navigate({ to: "/" }),
            onError: (err) => {
              const message = err instanceof Error ? err.message : "Đăng nhập Google thất bại";
              setError(message);
            },
          });
        }}
        disabled={isGoogleLoading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-pill bg-white text-[#242428] font-medium hover:bg-gray-100 transition-colors"
      >
        <GoogleIcon />
        {isGoogleLoading ? "Đang mở Google..." : "Tiếp tục với Google"}
      </button>

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
