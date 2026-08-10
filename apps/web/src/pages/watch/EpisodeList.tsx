import { Play, Search } from "lucide-react";
import { useState } from "react";
import type { ServerItem } from "@/lib/catalog-types";
import { cn } from "@/lib/utils";
import { epLabel } from "./constants";

export function EpisodeSidebar({
  items,
  currentSlug,
  onSelect,
}: {
  items: ServerItem[];
  currentSlug: string | undefined;
  onSelect: (slug: string) => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query
    ? items.filter((e) => e.name.toLowerCase().includes(query))
    : items;

  return (
    <div className="max-h-[320px] overflow-y-auto p-3 lg:absolute lg:inset-0 lg:max-h-none">
      <h2 className="mb-2 text-sm font-semibold text-white">Danh Sách Tập</h2>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Số tập"
          className="h-9 w-full rounded-md bg-elevated pl-8 pr-3 text-sm text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold"
        />
      </div>
      <ul className="space-y-1">
        {filtered.map((ep, i) => {
          const active = ep.slug === currentSlug;
          return (
            <li key={ep.slug}>
              <button
                onClick={() => onSelect(ep.slug)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 border-l-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-gold bg-elevated text-white"
                    : "border-transparent text-silver hover:bg-elevated/60 hover:text-white",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-xs text-muted">{i + 1}</span>
                  <span className="truncate">{epLabel(ep.name)}</span>
                </span>
                {active && (
                  <Play className="h-4 w-4 shrink-0 fill-gold text-gold" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
