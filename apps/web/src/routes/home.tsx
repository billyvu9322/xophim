import { Link } from "@tanstack/react-router";
import { ChevronRight, Info, Play, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MovieCard } from "@/components/MovieCard";
import { MovieRail } from "@/components/MovieRail";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useHome } from "@/hooks/catalog";
import { useHistory } from "@/hooks/user-state";
import type { Movie } from "@/lib/catalog-types";
import { langBadges } from "@/lib/format";
import { cn } from "@/lib/utils";

export function HomePage() {
  const { data, isLoading, error } = useHome();
  const { items: history } = useHistory();

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState />;

  const spotlight = data.latest.slice(0, 5);
  const trending = data.latest.slice(0, 10);

  const continueWatching = history.slice(0, 12).map((h) => ({
    slug: h.movie_slug,
    name: h.movie_snapshot.name,
    posterUrl: h.movie_snapshot.posterUrl,
    year: h.movie_snapshot.year,
    progress: h.duration_sec ? h.position_sec / h.duration_sec : 0,
  }));

  return (
    <div>
      <Spotlight movies={spotlight} />

      <div className="mx-auto max-w-[1600px] px-4 py-6">
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* main column */}
          <div className="min-w-0 flex-1 space-y-8">
            {continueWatching.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Xem Tiếp</h2>
                <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
                  {continueWatching.map((m) => (
                    <div key={m.slug} className="w-[140px] shrink-0 sm:w-[160px]">
                      <MovieCard movie={m} progress={m.progress} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <MovieRail title="Nổi Bật" movies={trending} ranked />
            <MovieRail
              title="Phim Mới Cập Nhật"
              movies={data.latest}
              action={
                <Link
                  to="/list/$type"
                  params={{ type: "phim-moi" }}
                  className="flex items-center text-sm text-muted hover:text-gold"
                >
                  Xem tất cả <ChevronRight className="h-4 w-4" />
                </Link>
              }
            />
            <MovieRail
              title="Phim Bộ Mới"
              movies={data.phimBo}
              action={
                <Link
                  to="/list/$type"
                  params={{ type: "phim-bo" }}
                  className="flex items-center text-sm text-muted hover:text-gold"
                >
                  Xem tất cả <ChevronRight className="h-4 w-4" />
                </Link>
              }
            />
            <MovieRail
              title="Phim Lẻ Mới"
              movies={data.phimLe}
              action={
                <Link
                  to="/list/$type"
                  params={{ type: "phim-le" }}
                  className="flex items-center text-sm text-muted hover:text-gold"
                >
                  Xem tất cả <ChevronRight className="h-4 w-4" />
                </Link>
              }
            />
            <MovieRail
              title="Hoạt Hình"
              movies={data.hoatHinh}
              action={
                <Link
                  to="/list/$type"
                  params={{ type: "hoat-hinh" }}
                  className="flex items-center text-sm text-muted hover:text-gold"
                >
                  Xem tất cả <ChevronRight className="h-4 w-4" />
                </Link>
              }
            />
          </div>

          {/* right Top 10 sidebar */}
          <Top10
            tabs={{
              "Hôm Nay": data.latest,
              Tuần: data.phimBo,
              Tháng: data.phimLe,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spotlight — auto-rotating hero carousel over a backdrop with a gradient scrim.
// ---------------------------------------------------------------------------
function Spotlight({ movies }: { movies: Movie[] }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (movies.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % movies.length), 6000);
    return () => clearInterval(id);
  }, [movies.length]);

  if (movies.length === 0) return null;
  const m = movies[idx];
  if (!m) return null;
  const badges = langBadges(m.lang);

  return (
    <section className="relative h-[420px] w-full overflow-hidden sm:h-[520px]">
      <img
        src={m.thumbUrl || m.posterUrl}
        alt={m.name}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/85 to-canvas/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/50 to-transparent" />

      <div className="relative mx-auto flex h-full max-w-[1600px] items-end px-4 pb-12">
        <div className="max-w-xl space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-gold">
            #{idx + 1} Nổi Bật
          </p>
          <h1 className="text-3xl font-bold text-white sm:text-5xl">{m.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {m.year != null && <Chip>{m.year}</Chip>}
            {m.quality && <Chip>{m.quality}</Chip>}
            {m.episodeCurrent && <Chip>{m.episodeCurrent}</Chip>}
            {m.score.imdb != null && (
              <span className="flex items-center gap-1 rounded bg-black/50 px-2 py-1 text-white">
                <Star className="h-3 w-3 fill-gold text-gold" /> IMDb {m.score.imdb.toFixed(1)}
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
          </div>
          {m.originName && <p className="line-clamp-2 text-sm text-silver">{m.originName}</p>}
          <div className="flex gap-3 pt-2">
            <Link to="/xem/$slug" params={{ slug: m.slug }}>
              <Button variant="primary" size="lg">
                <Play className="h-5 w-5 fill-[#111]" /> Xem Ngay
              </Button>
            </Link>
            <Link to="/xem/$slug" params={{ slug: m.slug }}>
              <Button variant="secondary" size="lg">
                <Info className="h-5 w-5" /> Thông Tin
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* dot indicators */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        {movies.map((mv, i) => (
          <button
            key={mv.slug}
            onClick={() => setIdx(i)}
            aria-label={`Slide ${i + 1}`}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === idx ? "w-6 bg-gold" : "w-2 bg-white/40",
            )}
          />
        ))}
      </div>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-white/10 px-2 py-1 text-white">{children}</span>;
}

// ---------------------------------------------------------------------------
// Top 10 sidebar — ranked list with Hôm Nay / Tuần / Tháng tabs.
// ---------------------------------------------------------------------------
function Top10({ tabs }: { tabs: Record<string, Movie[]> }) {
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
                  l === active ? "bg-gold text-[#111]" : "bg-elevated text-silver hover:text-white",
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
                <img
                  src={m.posterUrl}
                  alt={m.name}
                  className="h-16 w-11 shrink-0 object-cover"
                  loading="lazy"
                />
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
