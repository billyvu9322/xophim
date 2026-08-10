import { Link } from "@tanstack/react-router";
import { Info, Play, Star } from "lucide-react";
import { useState } from "react";
import { Autoplay } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper";
import { Button } from "@/components/ui/Button";
import { useMovieDetail } from "@/hooks/catalog";
import type { Movie } from "@/lib/catalog-types";
import { langBadges, stripHtml } from "@/lib/format";
import { cn } from "@/lib/utils";

import "swiper/css";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-white/10 px-2 py-1 text-white">{children}</span>
  );
}

export function Spotlight({ movies }: { movies: Movie[] }) {
  const [idx, setIdx] = useState(0);
  const [swiper, setSwiper] = useState<SwiperInstance | null>(null);

  // Description lives on the detail endpoint, not the latest feed — fetch it for
  // the active slide only (cached), so the hero can show a short synopsis.
  const active = movies[idx];
  const { data: activeDetail } = useMovieDetail(active?.slug ?? "");
  const activeDesc = activeDetail?.movie.content
    ? stripHtml(activeDetail.movie.content)
    : "";

  if (movies.length === 0) return null;

  return (
    <section className="relative h-[60vh] min-h-[440px] w-full overflow-hidden sm:h-[calc(100vh-4rem)] sm:max-h-[820px]">
      <Swiper
        modules={[Autoplay]}
        autoplay={
          movies.length > 1
            ? { delay: 6000, disableOnInteraction: false }
            : false
        }
        loop={movies.length > 1}
        speed={700}
        slidesPerView={1}
        className="h-full"
        onSwiper={setSwiper}
        onSlideChange={(instance) => setIdx(instance.realIndex)}
      >
        {movies.map((m, i) => {
          const badges = langBadges(m.lang);
          return (
            <SwiperSlide key={m.slug}>
              <img
                src={m.thumbUrl || m.posterUrl}
                alt={m.name}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                className="absolute inset-0 h-full w-full object-cover brightness-110 saturate-110"
              />
              {/* <div className="absolute inset-0 bg-black/15" />
              <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/65 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-canvas/90 via-canvas/25 to-transparent" /> */}
              <div className="absolute inset-0 bg-black/5" />
              <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/45 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-canvas/60 via-canvas/5 to-transparent" />

              <div className="relative mx-auto flex h-full max-w-[1600px] items-end px-4 pb-12">
                <div className="max-w-xl space-y-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-gold">
                    #{i + 1} Nổi Bật
                  </p>
                  <h1 className="text-3xl font-bold text-white sm:text-5xl">
                    {m.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {m.year != null && <Chip>{m.year}</Chip>}
                    {m.quality && <Chip>{m.quality}</Chip>}
                    {m.episodeCurrent && <Chip>{m.episodeCurrent}</Chip>}
                    {m.score.imdb != null && (
                      <span className="flex items-center gap-1 rounded bg-black/50 px-2 py-1 text-white">
                        <Star className="h-3 w-3 fill-gold text-gold" /> IMDb{" "}
                        {m.score.imdb.toFixed(1)}
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
                  {m.originName && (
                    <p className="text-sm text-silver">{m.originName}</p>
                  )}
                  {i === idx && activeDesc && (
                    <p className="line-clamp-3 max-w-xl text-sm leading-relaxed text-silver/90">
                      {activeDesc}
                    </p>
                  )}
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
            </SwiperSlide>
          );
        })}
      </Swiper>

      {/* dot indicators */}
      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2">
        {movies.map((mv, i) => (
          <button
            key={mv.slug}
            onClick={() => swiper?.slideToLoop(i)}
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
