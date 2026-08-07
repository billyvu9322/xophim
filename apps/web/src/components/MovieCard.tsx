import { Link } from "@tanstack/react-router";
import { Captions, Check, Mic, Play, Plus, Star } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactPlayer from "react-player";
import { toast } from "sonner";
import { Poster } from "./ui/Poster";
import { Skeleton } from "./ui/skeletons";
import { useMovieDetail } from "@/hooks/catalog";
import { useToggleWatchlist, useWatchlist } from "@/hooks/user-state";
import { episodeCount, langBadges, typeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

// Minimal shape a card needs — satisfied by catalog Movie and by the various
// snapshot rows (watchlist / history / collection items).
export interface MovieCardData {
  slug: string;
  name: string;
  posterUrl: string;
  year?: number | null;
  type?: string;
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
  /** When set, the card links straight to this episode (?tap=) — used by
      "Xem Tiếp" so a click resumes the exact episode + timeline. */
  episodeSlug?: string;
}

const HOVER_OPEN_DELAY = 180;
const HOVER_CLOSE_DELAY = 120;

// Sharp-cornered 2:3 poster. Whole card links straight to the player (instant
// play). On hover an AniWatch-style info popover floats over the grid (portaled
// to <body> so it escapes the rail's overflow clipping).
export function MovieCard({ movie, progress, rank, episodeSlug }: MovieCardProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);

  const badges = movie.lang ? langBadges(movie.lang) : [];
  const imdb = movie.score?.imdb ?? null;

  const cancelClose = useCallback(
    () => window.clearTimeout(closeTimer.current),
    [],
  );

  const scheduleOpen = useCallback(() => {
    cancelClose();
    openTimer.current = window.setTimeout(() => {
      if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
    }, HOVER_OPEN_DELAY);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    window.clearTimeout(openTimer.current);
    closeTimer.current = window.setTimeout(
      () => setRect(null),
      HOVER_CLOSE_DELAY,
    );
  }, []);

  return (
    <div
      ref={anchorRef}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      className="group"
    >
      <Link
        to="/xem/$slug"
        params={{ slug: movie.slug }}
        search={episodeSlug ? { tap: episodeSlug } : undefined}
        className="block"
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded bg-elevated">
          <Poster
            src={movie.posterUrl}
            alt={movie.name}
            label={movie.name}
            imgClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />

          {/* Hover: whitish frosted overlay + centered white play button. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/25 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-gold text-[#111] shadow-lg ring-1 ring-white/40">
              <Play className="h-5 w-5 translate-x-[1px] fill-[#111]" />
            </span>
          </div>

          {imdb != null && (
            <span className="absolute right-1 top-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
              <Star className="h-3 w-3 fill-gold text-gold" />
              {imdb.toFixed(1)}
            </span>
          )}

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

          {movie.episodeCurrent && (
            <span className="absolute bottom-1 right-1 rounded-sm bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              {movie.episodeCurrent}
            </span>
          )}

          {progress != null && progress > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
              <div
                className="h-full bg-gold"
                style={{
                  width: `${Math.min(100, Math.round(progress * 100))}%`,
                }}
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
            {movie.year != null && (
              <p className="text-xs text-muted">{movie.year}</p>
            )}
          </div>
        </div>
      </Link>

      {rect &&
        createPortal(
          <HoverCard
            movie={movie}
            anchor={rect}
            onEnter={cancelClose}
            onLeave={scheduleClose}
          />,
          document.body,
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating hover popover (AniWatch-style). Only mounted while hovering, so the
// watchlist hooks here run for at most one card at a time.
// ---------------------------------------------------------------------------
const POP_W = 300;
const POP_H = 330;

function HoverCard({
  movie,
  anchor,
  onEnter,
  onLeave,
}: {
  movie: MovieCardData;
  anchor: DOMRect;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { items } = useWatchlist();
  const toggle = useToggleWatchlist();
  const inWatchlist = items.some((w) => w.movie_slug === movie.slug);

  // Anchor to the card in DOCUMENT coordinates (viewport clamp + scroll offset)
  // so the popover stays glued to the poster and scrolls with the page — not
  // pinned to the screen like position:fixed. Its top-left corner sits near the
  // card centre so the popover fans out toward the bottom-right (AniWatch-style).
  const left =
    Math.min(
      Math.max(8, anchor.left + anchor.width / 2),
      window.innerWidth - POP_W - 8,
    ) + window.scrollX;
  // Keep the top edge below the sticky nav (h-16 = 64px) so the popover never
  // overlaps the header.
  const top =
    Math.min(
      Math.max(72, anchor.top + anchor.height / 2),
      window.innerHeight - POP_H - 8,
    ) + window.scrollY;

  const badges = movie.lang ? langBadges(movie.lang) : [];
  const eps = movie.episodeCurrent ? episodeCount(movie.episodeCurrent) : null;

  // Fetch detail on hover (cached by React Query) to surface the IMDb score and
  // a trailer. Trailer swaps in after a short delay so quick sweeps don't spin
  // up a player for every card the pointer grazes. Uses the raw trailer URL from
  // the API (YouTube by default) rendered via react-player.
  const { data: detail, isLoading: detailLoading } = useMovieDetail(movie.slug);
  const trailerUrl = detail?.movie.trailerUrl ?? null;
  const imdb = movie.score?.imdb ?? detail?.movie.score.imdb ?? null;
  const genres = (detail?.movie.categories ?? [])
    .slice(0, 3)
    .map((c) => c.name)
    .join(" • ");

  const snapshot = () => ({
    name: movie.name,
    posterUrl: movie.posterUrl,
    type: movie.type ?? "",
    year: movie.year ?? null,
  });

  const onToggle = () => {
    toggle.toggle(movie.slug, snapshot(), inWatchlist);
    toast.success(
      inWatchlist ? "Đã xóa khỏi danh sách" : "Đã thêm vào danh sách",
    );
  };

  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ position: "absolute", left, top, width: POP_W }}
      className="z-[60] origin-top-left animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 slide-in-from-left-1 overflow-hidden rounded-xl bg-white/10 shadow-2xl ring-1 ring-white/20 backdrop-blur-2xl duration-200 ease-out"
    >
      {/* backdrop: trailer if available, else poster + play */}
      <div className="relative aspect-video overflow-hidden bg-black">
        {trailerUrl ? (
          <ReactPlayer
            url={trailerUrl}
            playing
            muted
            loop
            width="100%"
            height="100%"
            style={{ position: "absolute", inset: 0 }}
            config={{
              youtube: {
                playerVars: {
                  controls: 0,
                  modestbranding: 1,
                  rel: 0,
                  playsinline: 1,
                },
              },
            }}
          />
        ) : (
          <Link
            to="/xem/$slug"
            params={{ slug: movie.slug }}
            className="group/pop block h-full w-full"
          >
            <Poster src={movie.posterUrl} alt={movie.name} label="" />
            {/* Whitish frosted overlay + centered white play button. */}
            <div className="absolute inset-0 bg-white/25 backdrop-blur-[2px]" />
            <span className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[#111] shadow-lg ring-1 ring-white/70 backdrop-blur transition-transform group-hover/pop:scale-110">
              <Play className="h-6 w-6 translate-x-[1px] fill-[#111]" />
            </span>
          </Link>
        )}
      </div>

      <div className="space-y-2.5 p-3">
        <Link to="/xem/$slug" params={{ slug: movie.slug }}>
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white drop-shadow hover:text-gold">
            {movie.name}
            {movie.year != null && (
              <span className="text-muted"> ({movie.year})</span>
            )}
          </h3>
        </Link>

        <div className="flex flex-wrap items-center gap-1">
          {imdb != null && (
            <span className="flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              <Star className="h-3 w-3 fill-gold text-gold" /> {imdb.toFixed(1)}
            </span>
          )}
          {movie.quality && (
            <span className="rounded bg-gold px-1.5 py-0.5 text-[10px] font-bold text-[#111]">
              {movie.quality}
            </span>
          )}
          {badges.map((b) => (
            <span
              key={b.label}
              className={cn(
                "flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#111]",
                b.kind === "sub" ? "bg-sub" : "bg-dub",
              )}
            >
              {b.kind === "sub" ? (
                <Captions className="h-3 w-3" />
              ) : (
                <Mic className="h-3 w-3" />
              )}
              {eps ?? b.label}
            </span>
          ))}
          {movie.type && (
            <span className="ml-auto rounded bg-gold px-1.5 py-0.5 text-[10px] font-bold text-[#111]">
              {typeLabel(movie.type)}
            </span>
          )}
        </div>

        {/* Genres come from the async detail fetch. Reserve a fixed one-line
            slot (skeleton while loading) so the popover height doesn't jump. */}
        {detailLoading ? (
          <Skeleton className="h-4 w-2/3 rounded" />
        ) : genres ? (
          <p className="line-clamp-1 text-xs leading-4 text-silver">{genres}</p>
        ) : null}

        <div className="flex items-center gap-2 pt-0.5">
          <Link
            to="/xem/$slug"
            params={{ slug: movie.slug }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-pill bg-gold py-2 text-sm font-medium text-[#111] hover:brightness-105"
          >
            <Play className="h-4 w-4 fill-[#111]" /> Xem Ngay
          </Link>
          <button
            onClick={onToggle}
            aria-label={
              inWatchlist ? "Xóa khỏi danh sách" : "Thêm vào danh sách"
            }
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors",
              inWatchlist
                ? "bg-gold text-[#111]"
                : "bg-white text-[#242428] hover:bg-gray-200",
            )}
          >
            {inWatchlist ? (
              <Check className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
