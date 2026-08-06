import type { ReactNode } from "react";
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
  if (movies.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        {action}
      </div>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
        {movies.map((m, i) => (
          <div key={m.slug} className="w-[140px] shrink-0 sm:w-[160px]">
            <MovieCard movie={m} rank={ranked ? i + 1 : undefined} />
          </div>
        ))}
      </div>
    </section>
  );
}
