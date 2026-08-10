import { useParams } from "@tanstack/react-router";
import { WatchSkeleton } from "@/components/ui/skeletons";
import { ErrorState } from "@/components/ui/states";
import { useMovieDetail } from "@/hooks/catalog";
import { WatchView } from "./WatchView";

export function WatchPage() {
  const { slug } = useParams({ from: "/xem/$slug" });
  const { data, isLoading, error } = useMovieDetail(slug);

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
