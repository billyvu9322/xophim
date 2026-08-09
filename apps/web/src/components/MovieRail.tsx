import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper";
import "swiper/css";
import { MovieCard, type MovieCardData } from "./MovieCard";

interface MovieRailProps {
  title: ReactNode;
  movies: MovieCardData[];
  /** show rank numerals (Nổi Bật / Top 10). */
  ranked?: boolean;
  action?: ReactNode;
}

// A labeled horizontal scroller of posters. Fixed-width cells so posters keep a
// uniform 2:3 and the rail scrolls sideways on overflow.
export function MovieRail({ title, movies, ranked, action }: MovieRailProps) {
  const [swiper, setSwiper] = useState<SwiperInstance | null>(null);

  if (movies.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <div className="flex items-center gap-2">
          {action}
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
        spaceBetween={ranked ? 18 : 12}
        speed={450}
        grabCursor
        className={`pb-2${ranked ? " !pl-3" : ""}`}
        onSwiper={setSwiper}
      >
        {movies.map((m, i) => (
          <SwiperSlide
            key={m.slug}
            className={
              ranked
                ? "!w-[calc((100%_-_60px)_/_6)] min-w-[120px]"
                : "!w-[140px] sm:!w-[160px]"
            }
          >
            <MovieCard movie={m} rank={ranked ? i + 1 : undefined} />
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}
