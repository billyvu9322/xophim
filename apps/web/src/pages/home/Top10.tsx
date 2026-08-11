import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Poster } from "@/components/ui/Poster";
import type { Movie } from "@/apis/types/catalog-types";
import { cn } from "@/lib/utils";

export function Top10({ tabs }: { tabs: Record<string, Movie[]> }) {
  const labels = useMemo(() => Object.keys(tabs), [tabs]);
  const [active, setActive] = useState(labels[0] ?? "");
  const list = (tabs[active] ?? []).slice(0, 10);

  return (
    <aside className="w-full shrink-0 lg:w-[320px]">
      <div className="sticky top-20 space-y-4 rounded-lg bg-chrome p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Top 10</h2>
          <div className="flex gap-1">
            {labels.map((l) => (
              <button
                key={l}
                onClick={() => setActive(l)}
                className={cn(
                  "rounded-pill px-2.5 py-1 text-xs transition-colors",
                  l === active
                    ? "bg-gold text-[#111]"
                    : "bg-elevated text-silver hover:text-white",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <ol className="space-y-3">
          {list.map((m, i) => (
            <li key={m.slug}>
              <Link
                to="/xem/$slug"
                params={{ slug: m.slug }}
                className="group flex items-center gap-3"
              >
                <span
                  className={cn(
                    "w-6 text-center text-xl font-bold",
                    i < 3 ? "text-gold" : "text-slate",
                  )}
                >
                  {i + 1}
                </span>
                <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-elevated">
                  <Poster
                    src={m.posterUrl}
                    alt={m.name}
                    compact
                    imgClassName="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white group-hover:text-gold">
                    {m.name}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {m.year ?? ""} {m.quality ? `· ${m.quality}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
