import InfiniteScroll from "react-infinite-scroll-component";
import { MovieGrid } from "./MovieGrid";
import type { Movie } from "@/lib/catalog-types";
import { DotLoading } from "./ui/DotLoading";

interface InfiniteMovieGridProps {
  movies: Movie[];
  hasMore: boolean;
  loadMore: () => void;
}

export function InfiniteMovieGrid({
  movies,
  hasMore,
  loadMore,
}: InfiniteMovieGridProps) {
  return (
    <InfiniteScroll
      dataLength={movies.length}
      next={loadMore}
      hasMore={hasMore}
      loader={<DotLoading />}
      endMessage={
        <p className="py-8 text-center text-sm text-muted">
          Đã tải hết danh sách phim.
        </p>
      }
    >
      <MovieGrid movies={movies} />
    </InfiniteScroll>
  );
}
