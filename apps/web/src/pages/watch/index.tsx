import { useParams } from "@tanstack/react-router";
import { WatchSkeleton } from "@/components/ui/skeletons";
import { ErrorState } from "@/components/ui/states";
import { useMovieDetail } from "@/hooks/catalog";
import { useSeo } from "@/hooks/useSeo";
import { WatchView } from "./WatchView";

export function WatchPage() {
  const { slug } = useParams({ from: "/xem/$slug" });
  const { data, isLoading, error } = useMovieDetail(slug);

  const movie = data?.movie;
  useSeo({
    title: movie
      ? `${movie.name}${movie.year ? ` (${movie.year})` : ""} - Xem phim Vietsub`
      : undefined,
    description: movie?.content
      ? movie.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)
      : undefined,
  });

  if (isLoading) return <WatchSkeleton />;
  if (error || !data) return <ErrorState />;
  return (
    <WatchView
      key={slug}
      slug={slug}
      movie={data.movie}
      similar={data.similar}
    />
  );
}
