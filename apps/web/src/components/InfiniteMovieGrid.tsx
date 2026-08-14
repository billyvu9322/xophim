import InfiniteScroll from "react-infinite-scroll-component";
import { MovieGrid } from "./MovieGrid";
import type { Movie } from "@/apis/types/catalog-types";
import { DotLoading } from "./ui/DotLoading";

interface InfiniteMovieGridProps {
  movies: Movie[];
  hasMore: boolean;
  loadMore: () => void;
  isFetching?: boolean;
}

export function InfiniteMovieGrid({
  movies,
  hasMore,
  loadMore,
  isFetching = false,
}: InfiniteMovieGridProps) {
  return (
    <InfiniteScroll
      dataLength={movies.length}
      next={() => {
        if (!isFetching) loadMore();
      }}
      hasMore={hasMore}
      scrollThreshold={0.95}
      loader={<DotLoading />}
    >
      <MovieGrid movies={movies} />
    </InfiniteScroll>
  );
}
