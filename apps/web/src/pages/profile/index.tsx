import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { useAuth, useUpdateProfile } from "@/hooks/auth";
import { PRESET_AVATARS } from "@/lib/avatars";
import { AvatarPicker } from "./AvatarPicker";
import { ProfileHeader } from "./ProfileHeader";

export function ProfilePage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const updateProfile = useUpdateProfile();

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Not logged in → send to login.
  useEffect(() => {
    if (!auth.isLoading && !auth.data) void navigate({ to: "/dang-nhap" });
  }, [auth.isLoading, auth.data, navigate]);

  // Seed the form from the current user once it loads.
  useEffect(() => {
    if (auth.data) {
      setDisplayName(auth.data.displayName || auth.data.username || "");
      setAvatarUrl(auth.data.avatarUrl);
    }
  }, [auth.data]);

  if (!auth.data) return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const name = displayName.trim();
    if (name.length < 1 || name.length > 50) {
      setError("Tên hiển thị phải từ 1–50 ký tự");
      return;
    }
    try {
      await updateProfile.mutateAsync({ displayName: name, avatarUrl });
      toast.success("Đã cập nhật hồ sơ");
    } catch {
      setError("Cập nhật thất bại, thử lại sau");
    }
  }

  const currentAvatar = avatarUrl ?? PRESET_AVATARS[0];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      <h1 className="text-2xl font-semibold text-white">Hồ Sơ</h1>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-6 rounded-lg bg-chrome/60 p-5 ring-1 ring-white/5"
      >
        {/* Current avatar + email */}
        <ProfileHeader
          currentAvatar={currentAvatar}
          displayName={displayName}
          username={auth.data.username || ""}
          email={auth.data.email}
        />

        {/* Display name */}
        <div className="space-y-1.5">
          <label className="block text-sm text-silver">Tên hiển thị</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nhập tên hiển thị"
            maxLength={50}
            className="h-11 w-full rounded-md bg-elevated px-3 text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>

        {/* Avatar picker */}
        <AvatarPicker avatarUrl={avatarUrl} onSelect={setAvatarUrl} />

        {error !== null && <p className="text-sm text-[#FC887B]">{error}</p>}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={updateProfile.isPending}
        >
          {updateProfile.isPending ? "Đang lưu..." : "Lưu Thay Đổi"}
        </Button>
      </form>
    </div>
  );
}
