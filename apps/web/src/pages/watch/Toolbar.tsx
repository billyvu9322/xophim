import { cn } from "@/lib/utils";

export function ToolBtn({
  icon,
  label,
  active,
  disabled,
  onClick,
  className,
  disabledShowLabel,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  disabledShowLabel?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "flex items-center gap-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active ? "text-gold" : "text-silver hover:text-gold",
        className,
      )}
    >
      {icon}
      {!disabledShowLabel && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

export function ToolToggle({
  icon,
  label,
  on,
  onLabel = "Bật",
  offLabel = "Tắt",
  onClick,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onLabel?: string;
  offLabel?: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 text-silver hover:text-white",
        className,
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}:</span>
      <span className={cn("font-medium", on ? "text-gold" : "text-muted")}>
        {on ? onLabel : offLabel}
      </span>
    </button>
  );
}

export function IconBtn({
  children,
  label,
  onClick,
  className,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-full text-silver hover:bg-elevated hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}
