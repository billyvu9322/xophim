import { useGoogleLogin } from "@react-oauth/google";
import { GoogleIcon } from "@/components/ui/GoogleIcon";

interface GoogleLoginButtonProps {
  /** Called with the Google access token (GIS implicit flow) on success. */
  onCredential: (accessToken: string) => void;
  onError: () => void;
  pending?: boolean;
  label?: string;
}

export function GoogleLoginButton({
  onCredential,
  onError,
  pending,
  label = "Tiếp tục với Google",
}: GoogleLoginButtonProps) {
  const trigger = useGoogleLogin({
    flow: "implicit",
    onSuccess: (resp) => onCredential(resp.access_token),
    onError,
  });

  return (
    <button
      type="button"
      onClick={() => trigger()}
      disabled={pending}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-pill bg-white font-medium text-[#242428] transition-colors hover:bg-gray-100 disabled:opacity-60"
    >
      <GoogleIcon />
      {pending ? "Đang đăng nhập..." : label}
    </button>
  );
}
