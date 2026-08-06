import { MovieCard, type MovieCardData } from "./MovieCard";

// Responsive poster grid — 2 cols on mobile → 7 on desktop (dense AniWatch feel).
export function MovieGrid({ movies }: { movies: MovieCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
      {movies.map((m) => (
        <MovieCard key={m.slug} movie={m} />
      ))}
    </div>
  );
}
