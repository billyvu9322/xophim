import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared loading / empty / error blocks. Copy is Vietnamese per DESIGN.md §7.

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-6 w-6 animate-spin text-gold", className)} />;
}

export function LoadingState({ label = "Đang tải..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted">
      <Spinner />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({ label = "Đã có lỗi xảy ra" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-muted">
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  label = "Không tìm thấy phim nào",
  children,
}: {
  label?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-muted">
      <p className="text-sm">{label}</p>
      {children}
    </div>
  );
}
