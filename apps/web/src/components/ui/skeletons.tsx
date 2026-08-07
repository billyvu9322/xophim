import { cn } from "@/lib/utils";

// Skeleton loaders that mirror each page's real layout so the first-load shift
// is minimal. Copy-free (no text) — pure shape placeholders with a subtle pulse.

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-elevated", className)} />;
}

// A single poster cell (2:3) with a title line — matches MovieCard.
function PosterCardSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="aspect-[2/3] w-full rounded" />
      <Skeleton className="h-3.5 w-11/12 rounded" />
      <Skeleton className="h-3 w-2/3 rounded" />
    </div>
  );
}

// Responsive poster grid — same column steps as <MovieGrid>.
export function MovieGridSkeleton({ count = 14 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
      {Array.from({ length: count }).map((_, i) => (
        <PosterCardSkeleton key={i} />
      ))}
    </div>
  );
}

// A labeled horizontal rail — matches <MovieRail>.
function MovieRailSkeleton({ count = 8 }: { count?: number }) {
  return (
    <section className="space-y-3">
      <Skeleton className="h-6 w-40 rounded" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="w-[140px] shrink-0 space-y-2 sm:w-[160px]">
            <Skeleton className="aspect-[2/3] w-full rounded" />
            <Skeleton className="h-3.5 w-11/12 rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}

// Home — spotlight hero + rails (main column) + Top 10 sidebar.
export function HomeSkeleton() {
  return (
    <div>
      <Skeleton className="h-[420px] w-full !rounded-none sm:h-[520px]" />
      <div className="mx-auto max-w-[1600px] px-4 py-6">
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-8">
            <MovieRailSkeleton />
            <MovieRailSkeleton />
            <MovieRailSkeleton />
          </div>
          <aside className="w-full shrink-0 lg:w-[320px]">
            <div className="space-y-4 rounded-lg bg-chrome p-4">
              <Skeleton className="h-6 w-24 rounded" />
              <div className="space-y-3">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-16 w-11 shrink-0 rounded" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-4/5 rounded" />
                      <Skeleton className="h-3 w-2/5 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// Collections index — 16:9 cover cards, 1→3 columns.
export function CollectionsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-[16/9] w-full rounded-lg" />
      ))}
    </div>
  );
}

// Collection detail — header banner + poster grid.
export function CollectionDetailSkeleton() {
  return (
    <>
      <Skeleton className="min-h-[200px] w-full rounded-lg sm:min-h-[280px]" />
      <MovieGridSkeleton />
    </>
  );
}

// Watch — breadcrumb + player block (left) + info sidebar (right).
export function WatchSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-6">
      <Skeleton className="h-4 w-64 rounded" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3 rounded-lg bg-chrome/70 p-3">
          <Skeleton className="aspect-video w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-12 w-full rounded" />
        </div>
        <div className="space-y-3">
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          <Skeleton className="h-5 w-3/4 rounded" />
          <Skeleton className="h-3.5 w-full rounded" />
          <Skeleton className="h-3.5 w-5/6 rounded" />
          <Skeleton className="h-3.5 w-2/3 rounded" />
        </div>
      </div>
    </div>
  );
}
