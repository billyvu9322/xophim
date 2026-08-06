import InfiniteScroll from "react-infinite-scroll-component";
import { MovieGrid } from "./MovieGrid";
import type { Movie } from "@/lib/catalog-types";

interface InfiniteMovieGridProps {
  movies: Movie[];
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
}

export function InfiniteMovieGrid({
  movies,
  hasMore,
  isLoadingMore,
  loadMore,
}: InfiniteMovieGridProps) {
  return (
    <InfiniteScroll
      dataLength={movies.length}
      next={loadMore}
      hasMore={hasMore}
      loader={<InfiniteLoader />}
      endMessage={
        <p className="py-8 text-center text-sm text-muted">Đã tải hết danh sách phim.</p>
      }
    >
      <MovieGrid movies={movies} />
      {isLoadingMore && <InfiniteLoader />}
    </InfiniteScroll>
  );
}

function InfiniteLoader() {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
      <span className="h-2 w-2 animate-bounce rounded-full bg-gold [animation-delay:-0.2s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-gold [animation-delay:-0.1s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-gold" />
      <span>Đang tải thêm...</span>
    </div>
  );
}
