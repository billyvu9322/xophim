import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

// Compact numbered pager with prev/next. Shows a window of pages around the
// current one; gold fill marks the active page.
export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const window = 2;
  const from = Math.max(1, page - window);
  const to = Math.min(totalPages, page + window);
  const pages: number[] = [];
  for (let p = from; p <= to; p += 1) pages.push(p);

  const btn = "grid h-9 min-w-9 place-items-center rounded-md px-2 text-sm transition-colors";

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 py-8">
      <button
        className={cn(btn, "bg-elevated text-white disabled:opacity-40")}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Trang trước"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {from > 1 && (
        <>
          <button className={cn(btn, "bg-elevated text-silver")} onClick={() => onChange(1)}>
            1
          </button>
          {from > 2 && <span className="px-1 text-muted">…</span>}
        </>
      )}

      {pages.map((p) => (
        <button
          key={p}
          className={cn(
            btn,
            p === page ? "bg-gold font-semibold text-[#111]" : "bg-elevated text-silver hover:text-white",
          )}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}

      {to < totalPages && (
        <>
          {to < totalPages - 1 && <span className="px-1 text-muted">…</span>}
          <button
            className={cn(btn, "bg-elevated text-silver")}
            onClick={() => onChange(totalPages)}
          >
            {totalPages}
          </button>
        </>
      )}

      <button
        className={cn(btn, "bg-elevated text-white disabled:opacity-40")}
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Trang sau"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
