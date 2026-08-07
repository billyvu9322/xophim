import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { AuthCard } from "@/components/AuthCard";
import { GoogleLoginButton } from "@/components/GoogleLoginButton";
import { Button } from "@/components/ui/Button";
import { useAuth, useLoginWithGoogle, useRegister, useMergeGuest } from "@/hooks/auth";
import { useGuestStore } from "@/lib/guest-store";

export function RegisterPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const registerMutation = useRegister();
  const mergeGuestMutation = useMergeGuest();
  const googleLogin = useLoginWithGoogle();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (auth.data) {
      void navigate({ to: "/" });
    }
  }, [auth.data, navigate]);

  function validateConfirm(pw: string, cf: string) {
    if (cf.length > 0 && pw !== cf) {
      setConfirmError("Mật khẩu nhập lại không khớp");
    } else {
      setConfirmError(null);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setConfirmError("Mật khẩu nhập lại không khớp");
      return;
    }
    setConfirmError(null);

    try {
      await registerMutation.mutateAsync({ username, email, password });

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
        "Đăng ký thất bại";
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

  const isLoading = registerMutation.isPending;

  return (
    <AuthCard heading="Đăng Ký" bgImage="/auth-bg-register.jpg">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {/* Username */}
        <div className="space-y-1.5">
          <label className="block text-sm text-silver">Tên đăng nhập</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Nhập tên đăng nhập"
            required
            className="w-full h-11 px-3 bg-elevated rounded-md text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label className="block text-sm text-silver">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Nhập email"
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
              onChange={(e) => {
                setPassword(e.target.value);
                validateConfirm(e.target.value, confirm);
              }}
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

        {/* Confirm password */}
        <div className="space-y-1.5">
          <label className="block text-sm text-silver">Nhập lại mật khẩu</label>
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                validateConfirm(password, e.target.value);
              }}
              placeholder="Nhập lại mật khẩu"
              required
              className="w-full h-11 px-3 pr-10 bg-elevated rounded-md text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-silver"
              tabIndex={-1}
              aria-label={showConfirm ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {confirmError !== null && (
            <p className="text-[#FC887B] text-sm">{confirmError}</p>
          )}
        </div>

        {/* Inline server error */}
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
          {isLoading ? "Đang đăng ký..." : "Đăng Ký"}
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
        label="Đăng ký với Google"
      />

      {/* Footer switch */}
      <p className="text-sm text-muted text-center">
        Đã có tài khoản?{" "}
        <Link to="/dang-nhap" className="text-gold hover:brightness-110">
          Đăng nhập
        </Link>
      </p>
    </AuthCard>
  );
}
