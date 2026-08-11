import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper";
import "swiper/css";
import { MovieCard } from "@/components/MovieCard";
import { useDeleteHistory, useHistory } from "@/hooks/user-state";

export function ContinueWatching() {
  const { items: history } = useHistory();
  const deleteHistory = useDeleteHistory();
  const [swiper, setSwiper] = useState<SwiperInstance | null>(null);

  // Continue-watching = ONE card per movie (the most recently watched episode).
  // History has a row per (movie, episode); dedupe by slug keeping the latest so
  // a movie watched across 2 episodes doesn't show up twice.
  const seenSlugs = new Set<string>();
  const continueWatching = [...history]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .filter((h) => {
      if (seenSlugs.has(h.movie_slug)) return false;
      seenSlugs.add(h.movie_slug);
      return true;
    })
    .slice(0, 12)
    .map((h) => ({
      slug: h.movie_slug,
      name: h.movie_snapshot.name,
      posterUrl: h.movie_snapshot.posterUrl,
      year: h.movie_snapshot.year,
      episodeSlug: h.episode_slug,
      progress: h.duration_sec ? h.position_sec / h.duration_sec : 0,
    }));

  if (continueWatching.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Xem Tiếp</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Cuộn phim sang trái"
            onClick={() => swiper?.slidePrev()}
            className="hidden rounded-full bg-elevated p-2 text-silver transition-colors hover:bg-chip hover:text-white sm:grid"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Cuộn phim sang phải"
            onClick={() => swiper?.slideNext()}
            className="hidden rounded-full bg-elevated p-2 text-silver transition-colors hover:bg-chip hover:text-white sm:grid"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <Swiper
        slidesPerView="auto"
        spaceBetween={12}
        speed={450}
        grabCursor
        className="pb-2"
        onSwiper={setSwiper}
      >
        {continueWatching.map((m) => (
          <SwiperSlide key={m.slug} className="!w-[140px] sm:!w-[160px]">
            <div className="group relative">
              <MovieCard
                movie={m}
                progress={m.progress}
                episodeSlug={m.episodeSlug}
              />
              <button
                type="button"
                aria-label={`Xóa ${m.name} khỏi Xem Tiếp`}
                title="Xóa khỏi Xem Tiếp"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  deleteHistory.remove(m.slug);
                }}
                // Kept inside the slide (Swiper clips overflow) so it isn't cut off.
                className="absolute right-1.5 top-1.5 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white opacity-0 shadow-lg shadow-black/40 ring-1 ring-white/15 backdrop-blur transition hover:bg-danger hover:text-white focus:opacity-100 group-hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}
