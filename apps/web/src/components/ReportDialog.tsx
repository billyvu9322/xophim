import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/Button";
import { useReport } from "@/hooks/community";
import type { ReportReason } from "@/lib/community-types";
import { cn } from "@/lib/utils";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "khong-phat", label: "Không phát được" },
  { value: "sai-phim", label: "Sai phim" },
  { value: "loi-phu-de", label: "Lỗi phụ đề" },
  { value: "giat-lag", label: "Giật/lag" },
];

// "Báo lỗi phim" modal (DESIGN.md §7 report dialog). Posts to /v1/reports.
export function ReportDialog({
  slug,
  episodeSlug,
  onClose,
}: {
  slug: string;
  episodeSlug?: string;
  onClose: () => void;
}) {
  const report = useReport();
  const [reason, setReason] = useState<ReportReason>("khong-phat");
  const [note, setNote] = useState("");

  const submit = () => {
    report.mutate(
      { slug, episodeSlug, reason, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Đã gửi báo lỗi. Cảm ơn bạn!");
          onClose();
        },
        onError: () => toast.error("Không gửi được báo lỗi"),
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-lg bg-chrome p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Báo lỗi phim</h3>
          <button onClick={onClose} aria-label="Đóng" className="text-muted hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          {REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                reason === r.value ? "bg-gold text-[#111]" : "bg-elevated text-silver hover:text-white",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Mô tả thêm (không bắt buộc)..."
          rows={3}
          className="w-full resize-none rounded-md bg-elevated p-3 text-sm text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold"
        />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Hủy
          </Button>
          <Button size="sm" onClick={submit} disabled={report.isPending}>
            Gửi Báo Lỗi
          </Button>
        </div>
      </div>
    </div>
  );
}
