import { cn } from "@/lib/utils";
import { TRACK_LABEL, TRACK_TEXT } from "./constants";

export function ServerSelector({
  groups,
  activeIdx,
  onSelect,
}: {
  groups: Record<"sub" | "dub" | "long", { idx: number; name: string }[]>;
  activeIdx: number;
  onSelect: (idx: number) => void;
}) {
  const tracks: ("sub" | "dub" | "long")[] = ["sub", "dub", "long"];
  if (!tracks.some((t) => groups[t].length > 0)) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-white">Chọn Server</h2>
      {tracks.map((t) =>
        groups[t].length === 0 ? null : (
          <div key={t} className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-xs font-semibold uppercase tracking-wide",
                TRACK_TEXT[t],
              )}
            >
              {TRACK_LABEL[t]}
            </span>
            {groups[t].map((s) => (
              <button
                key={s.idx}
                onClick={() => onSelect(s.idx)}
                className={cn(
                  "rounded-pill px-4 py-1.5 text-sm transition-colors",
                  s.idx === activeIdx
                    ? "bg-gold font-medium text-[#111]"
                    : "bg-chip text-silver hover:text-white",
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        ),
      )}
    </div>
  );
}
