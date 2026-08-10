import { Star } from "lucide-react";
import { useState } from "react";
import { RatingBlock } from "@/components/RatingBlock";
import { Poster } from "@/components/ui/Poster";
import type { MovieDetail } from "@/lib/catalog-types";
import { langBadges, stripHtml, typeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

function Synopsis({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return <p className="text-sm text-muted">Chưa có mô tả.</p>;
  const long = text.length > 160;
  return (
    <div className="space-y-1">
      <p
        className={cn(
          "text-sm leading-relaxed text-silver",
          long && !open && "line-clamp-6",
        )}
      >
        {text}
      </p>
      {long && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-semibold text-gold hover:underline"
        >
          {open ? "Thu gọn" : "Xem thêm"}
        </button>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted">{label}:</dt>
      <dd className="text-silver">{value}</dd>
    </div>
  );
}

export function MovieDetailPanel({
  movie,
  slug,
}: {
  movie: MovieDetail;
  slug: string;
}) {
  const badges = langBadges(movie.lang);

  return (
    <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      <div className="w-48 max-w-[120px] overflow-hidden rounded lg:w-full">
        <div className="aspect-[2/3]">
          <Poster
            src={movie.posterUrl}
            alt={movie.name}
            label={movie.name}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h1 className="text-xl font-bold text-white">{movie.name}</h1>
        {movie.originName && (
          <p className="text-sm text-muted">{movie.originName}</p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {movie.score.imdb != null && (
            <span className="flex items-center gap-1 rounded bg-black/50 px-2 py-1 text-white">
              <Star className="h-3 w-3 fill-gold text-gold" />{" "}
              {movie.score.imdb.toFixed(1)}
            </span>
          )}
          {movie.quality && (
            <span className="rounded bg-gold px-1.5 py-1 font-bold text-[#111]">
              {movie.quality}
            </span>
          )}
          {badges.map((b) => (
            <span
              key={b.label}
              className={cn(
                "rounded-sm px-1.5 py-1 font-semibold text-[#111]",
                b.kind === "sub" ? "bg-sub" : "bg-dub",
              )}
            >
              {b.label}
            </span>
          ))}
          <span className="rounded bg-chip px-1.5 py-1 text-silver">
            {typeLabel(movie.type)}
          </span>
        </div>

        {movie.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {movie.categories.map((c) => (
              <span
                key={c.slug}
                className="rounded-pill bg-chip px-2.5 py-1 text-xs text-silver"
              >
                {c.name}
              </span>
            ))}
          </div>
        )}

        <Synopsis text={movie.content ? stripHtml(movie.content) : ""} />

        <dl className="space-y-1.5 text-sm">
          {movie.directors.length > 0 && (
            <InfoRow
              label="Đạo diễn"
              value={movie.directors.join(", ")}
            />
          )}
          {movie.actors.length > 0 && (
            <InfoRow label="Diễn viên" value={movie.actors.join(", ")} />
          )}
          {movie.countries.length > 0 && (
            <InfoRow
              label="Quốc gia"
              value={movie.countries.map((c) => c.name).join(", ")}
            />
          )}
          {movie.time && (
            <InfoRow label="Thời lượng" value={movie.time} />
          )}
          {movie.status && (
            <InfoRow label="Trạng thái" value={movie.status} />
          )}
        </dl>
      </div>

      <RatingBlock slug={slug} />
    </aside>
  );
}
