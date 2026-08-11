import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { FiltersData } from "@/apis/types/catalog-types";
import { cn } from "@/lib/utils";

// Sort presets — labels mirror RoPhim; fields map to what the KKPhim list API
// actually supports (modified.time / year / _id).
// `imdb: true` sorts client-side by IMDb score (KKPhim's list API has no IMDb
// sort_field); the server field is kept valid as the fetch order.
export const SORT_OPTIONS = [
  { label: "Mới Nhất", field: "modified.time", type: "desc", imdb: false },
  { label: "Điểm IMDb", field: "modified.time", type: "desc", imdb: true },
  { label: "Năm", field: "year", type: "desc", imdb: false },
  { label: "Tên A–Z", field: "_id", type: "asc", imdb: false },
] as const;

// Movie types selectable in the "Loại phim" row → maps to the /list/$type slug.
export const TYPE_OPTIONS = [
  { label: "Tất cả", slug: "phim-moi" },
  { label: "Phim Bộ", slug: "phim-bo" },
  { label: "Phim Lẻ", slug: "phim-le" },
  { label: "Hoạt Hình", slug: "hoat-hinh" },
  { label: "TV Shows", slug: "tv-shows" },
] as const;

const LANG_OPTIONS = [
  { label: "Tất cả", value: "" },
  { label: "Thuyết Minh", value: "thuyet-minh" },
  { label: "Lồng Tiếng", value: "long-tieng" },
] as const;

export interface FilterValue {
  /** /list/$type slug — only meaningful when `showType` is set. */
  type: string;
  // Country / category / year are multi-select (KKPhim accepts comma-separated
  // values, treated as OR).
  country: string[];
  category: string[];
  year: number[];
  lang: string;
  sortIdx: number;
}

export const EMPTY_FILTER: FilterValue = {
  type: "phim-moi",
  country: [],
  category: [],
  year: [],
  lang: "",
  sortIdx: 0,
};

// Toggle a value in a multi-select array.
function toggleSlug(arr: string[], slug: string): string[] {
  return arr.includes(slug) ? arr.filter((s) => s !== slug) : [...arr, slug];
}
function toggleNum(arr: number[], n: number): number[] {
  return arr.includes(n) ? arr.filter((v) => v !== n) : [...arr, n];
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-gold font-medium text-[#111]"
          : "text-silver hover:bg-elevated hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate/30 py-3 last:border-b-0 sm:flex-row sm:gap-4">
      <span className="shrink-0 pt-1.5 text-sm text-muted sm:w-28">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

interface MovieFilterProps {
  filters?: FiltersData;
  value: FilterValue;
  onApply: (value: FilterValue) => void;
  /** Show the "Loại phim" row (browse). Hidden on search (no type there). */
  showType?: boolean;
  /** Start expanded — used on the dedicated filter page. */
  defaultOpen?: boolean;
}

export function MovieFilter({
  filters,
  value,
  onApply,
  showType,
  defaultOpen = false,
}: MovieFilterProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState<FilterValue>(value);

  const toggle = () => {
    if (!open) setDraft(value);
    setOpen((v) => !v);
  };

  const apply = () => {
    onApply(draft);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full max-w-[150px] items-center gap-2 text-sm font-semibold text-gold"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Bộ Lọc
      </button>
      <div className="rounded-lg bg-chrome/60 ring-1 ring-white/5">
        {open && (
          <div className="px-4 pb-4">
            {/* On mobile the panel is tall (many chips) — cap it and scroll the
                rows internally so the grid below isn't pushed off-screen. The
                Lọc/Đóng bar stays pinned outside this scroll region. */}
            <div className="max-h-[55vh] overflow-y-auto pr-1 [scrollbar-width:thin] sm:max-h-none sm:overflow-visible sm:pr-0">
              <Row label="Quốc gia">
                <Chip
                  active={draft.country.length === 0}
                  onClick={() => setDraft({ ...draft, country: [] })}
                >
                  Tất cả
                </Chip>
                {filters?.countries.map((c) => (
                  <Chip
                    key={c.slug}
                    active={draft.country.includes(c.slug)}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        country: toggleSlug(draft.country, c.slug),
                      })
                    }
                  >
                    {c.name}
                  </Chip>
                ))}
              </Row>

              {showType && (
                <Row label="Loại phim">
                  {TYPE_OPTIONS.map((t) => (
                    <Chip
                      key={t.slug}
                      active={draft.type === t.slug}
                      onClick={() => setDraft({ ...draft, type: t.slug })}
                    >
                      {t.label}
                    </Chip>
                  ))}
                </Row>
              )}

              <Row label="Âm thanh">
                {LANG_OPTIONS.map((l) => (
                  <Chip
                    key={l.value}
                    active={draft.lang === l.value}
                    onClick={() => setDraft({ ...draft, lang: l.value })}
                  >
                    {l.label}
                  </Chip>
                ))}
              </Row>

              <Row label="Thể loại">
                <Chip
                  active={draft.category.length === 0}
                  onClick={() => setDraft({ ...draft, category: [] })}
                >
                  Tất cả
                </Chip>
                {filters?.categories.map((c) => (
                  <Chip
                    key={c.slug}
                    active={draft.category.includes(c.slug)}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        category: toggleSlug(draft.category, c.slug),
                      })
                    }
                  >
                    {c.name}
                  </Chip>
                ))}
              </Row>

              <Row label="Năm sản xuất">
                <Chip
                  active={draft.year.length === 0}
                  onClick={() => setDraft({ ...draft, year: [] })}
                >
                  Tất cả
                </Chip>
                {filters?.years.map((y) => (
                  <Chip
                    key={y}
                    active={draft.year.includes(y)}
                    onClick={() =>
                      setDraft({ ...draft, year: toggleNum(draft.year, y) })
                    }
                  >
                    {y}
                  </Chip>
                ))}
              </Row>

              <Row label="Sắp xếp">
                {SORT_OPTIONS.map((opt, idx) => (
                  <Chip
                    key={opt.label}
                    active={draft.sortIdx === idx}
                    onClick={() => setDraft({ ...draft, sortIdx: idx })}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </Row>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={apply}
                className="rounded-md bg-gold px-5 py-2 text-sm font-medium text-[#111] hover:brightness-105"
              >
                Lọc kết quả →
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-elevated px-5 py-2 text-sm text-silver hover:bg-chip hover:text-white"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
