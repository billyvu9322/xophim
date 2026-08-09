import { useParams } from "@tanstack/react-router";
import { useCollection } from "@/hooks/collections";
import { MovieGrid } from "@/components/MovieGrid";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { CollectionDetailSkeleton } from "@/components/ui/skeletons";
import type { MovieCardData } from "@/components/MovieCard";
import type { CollectionItem } from "@/lib/collections-types";

function toMovieCardData(item: CollectionItem): MovieCardData {
  return {
    slug: item.movieSlug,
    name: item.snapshot.name,
    posterUrl: item.snapshot.posterUrl,
    year: item.snapshot.year,
    quality: item.snapshot.quality,
  };
}

export function CollectionDetailPage() {
  const { slug } = useParams({ from: "/chu-de/$slug" });
  const { data, isLoading, error } = useCollection(slug);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
      {isLoading && <CollectionDetailSkeleton />}
      {error && <ErrorState />}

      {!isLoading && !error && !data && <EmptyState />}

      {!isLoading && !error && data && (
        <>
          {/* Header banner */}
          <div className="relative overflow-hidden rounded-lg min-h-[200px] sm:min-h-[280px] bg-elevated">
            {data.cover_url ? (
              <img
                src={data.cover_url}
                alt={data.title}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : null}

            {/* Gradient scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

            {/* Title + description overlay */}
            <div className="relative z-10 flex h-full flex-col justify-end p-4 sm:p-6 md:p-8">
              <h1 className="text-3xl font-bold text-white leading-tight">
                {data.title}
              </h1>
              {data.description ? (
                <p className="mt-2 max-w-2xl text-silver text-sm sm:text-base leading-relaxed line-clamp-3">
                  {data.description}
                </p>
              ) : null}
            </div>
          </div>

          {/* Movie grid */}
          {data.items.length === 0 ? (
            <EmptyState label="Bộ sưu tập chưa có phim nào" />
          ) : (
            <MovieGrid movies={data.items.map(toMovieCardData)} />
          )}
        </>
      )}
    </div>
  );
}
