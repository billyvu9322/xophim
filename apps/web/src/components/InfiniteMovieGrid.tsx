import InfiniteScroll from "react-infinite-scroll-component";
import { MovieGrid } from "./MovieGrid";
import type { Movie } from "@/lib/catalog-types";
import { DotLoading } from "./ui/DotLoading";

interface InfiniteMovieGridProps {
  movies: Movie[];
  hasMore: boolean;
  loadMore: () => void;
  /** True while a page fetch is in flight — blocks re-triggering. */
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
      // Serialize page loads: ignore re-triggers while a fetch is in flight.
      // KKPhim pages dedupe heavily, so each page adds little height and the
      // sentinel stays in-view — without this guard InfiniteScroll cascades
      // through many pages at once before any of them render.
      next={() => {
        if (!isFetching) loadMore();
      }}
      hasMore={hasMore}
      // Trigger only when the user is near the very bottom (default 0.8 fires
      // too early on tall viewports and compounds the cascade above).
      scrollThreshold={0.95}
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
