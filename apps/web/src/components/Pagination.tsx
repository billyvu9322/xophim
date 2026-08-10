import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

// Circular pager: « ‹ 1 2 3 4 5 › » — dark round buttons, gold-filled active.
// Shows a window of pages around the current one.
export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const window = 2;
  const from = Math.max(1, page - window);
  const to = Math.min(totalPages, page + window);
  const pages: number[] = [];
  for (let p = from; p <= to; p += 1) pages.push(p);

  const circle =
    "grid h-10 w-10 place-items-center rounded-full text-sm transition-colors";
  const arrow = cn(
    circle,
    "bg-elevated text-silver hover:bg-chip hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-elevated disabled:hover:text-silver",
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 py-8">
      <button
        className={arrow}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Trang trước"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {pages.map((p) => (
        <button
          key={p}
          className={cn(
            circle,
            p === page
              ? "bg-gold font-semibold text-[#111]"
              : "bg-elevated text-silver hover:bg-chip hover:text-white",
          )}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}

      <button
        className={arrow}
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Trang sau"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
