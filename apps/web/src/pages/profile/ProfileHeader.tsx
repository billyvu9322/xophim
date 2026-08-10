interface ProfileHeaderProps {
  currentAvatar: string | undefined;
  displayName: string;
  username: string;
  email: string;
}

export function ProfileHeader({
  currentAvatar,
  displayName,
  username,
  email,
}: ProfileHeaderProps) {
  return (
    <div className="flex items-center gap-4">
      <img
        src={currentAvatar}
        alt="Avatar"
        className="h-20 w-20 shrink-0 rounded-full bg-elevated object-cover ring-2 ring-gold/60"
      />
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold text-white">
          {displayName || username || email}
        </p>
        <p className="truncate text-sm text-muted">{email}</p>
      </div>
    </div>
  );
}
