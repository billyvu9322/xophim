import { Link } from "@tanstack/react-router";
import { Play, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { langBadges } from "@/lib/format";

// Minimal shape a card needs — satisfied by catalog Movie and by the various
// snapshot rows (watchlist / history / collection items).
export interface MovieCardData {
  slug: string;
  name: string;
  posterUrl: string;
  year?: number | null;
  lang?: string;
  quality?: string;
  episodeCurrent?: string;
  score?: { imdb: number | null; tmdb: number | null };
}

interface MovieCardProps {
  movie: MovieCardData;
  /** 0..1 — draws a gold progress bar across the poster bottom (Xem Tiếp). */
  progress?: number;
  /** Trending rank → large faint outline numeral beside the poster. */
  rank?: number;
}

// Sharp-cornered 2:3 poster. Whole card links straight to the player (instant
// play, DESIGN.md signature deviation). Hover: scale + gold play button.
export function MovieCard({ movie, progress, rank }: MovieCardProps) {
  const badges = movie.lang ? langBadges(movie.lang) : [];
  const imdb = movie.score?.imdb ?? null;

  const card = (
    <Link
      to="/xem/$slug"
      params={{ slug: movie.slug }}
      className="group block"
      title={movie.name}
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-elevated">
        <img
          src={movie.posterUrl}
          alt={movie.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
        {/* hover scrim + play */}
        <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-gold text-[#111]">
            <Play className="h-6 w-6 translate-x-[1px] fill-[#111]" />
          </span>
        </div>

        {/* IMDb score top-right */}
        {imdb != null && (
          <span className="absolute right-1 top-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
            <Star className="h-3 w-3 fill-gold text-gold" />
            {imdb.toFixed(1)}
          </span>
        )}

        {/* language track badges bottom-left */}
        <div className="absolute bottom-1 left-1 flex gap-1">
          {badges.map((b) => (
            <span
              key={b.label}
              className={cn(
                "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold text-[#111]",
                b.kind === "sub" ? "bg-sub" : "bg-dub",
              )}
            >
              {b.label}
            </span>
          ))}
        </div>

        {/* episode / quality badge bottom-right */}
        {movie.episodeCurrent && (
          <span className="absolute bottom-1 right-1 rounded-sm bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {movie.episodeCurrent}
          </span>
        )}

        {/* continue-watching progress bar */}
        {progress != null && progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <div
              className="h-full bg-gold"
              style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
            />
          </div>
        )}
      </div>

      <div className="mt-1.5 flex items-start gap-2">
        {rank != null && (
          <span
            className={cn(
              "text-2xl font-bold leading-none",
              rank <= 3 ? "text-gold" : "text-slate",
            )}
          >
            {rank.toString().padStart(2, "0")}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white group-hover:text-gold">
            {movie.name}
          </p>
          {movie.year != null && <p className="text-xs text-muted">{movie.year}</p>}
        </div>
      </div>
    </Link>
  );

  return card;
}
