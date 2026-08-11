import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useCollections } from "@/hooks/collections";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { CollectionsSkeleton } from "@/components/ui/skeletons";
import { cn } from "@/lib/utils";
import type { Collection } from "@/apis/types/collections-types";

function CollectionCard({ c }: { c: Collection }) {
  return (
    <Link to="/chu-de/$slug" params={{ slug: c.slug }} className="group block">
      <div
        className={cn(
          "relative aspect-[16/9] overflow-hidden rounded-lg",
          !c.cover_url && "bg-elevated",
        )}
      >
        {c.cover_url ? (
          <img
            src={c.cover_url}
            alt={c.title}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="h-full w-full bg-gradient-to-br from-chrome via-elevated to-chrome object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : null}

        {/* Bottom-to-top gradient scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* Overlaid content — bottom-left */}
        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
          <p className="text-lg font-semibold text-white leading-snug line-clamp-2">
            {c.title}
          </p>
          <span
            className={cn(
              "mt-1.5 inline-flex items-center gap-1 text-sm text-gold",
              "transition-opacity opacity-80 group-hover:opacity-100",
            )}
          >
            Xem Bộ Sưu Tập
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function CollectionsPage() {
  const { data, isLoading, error } = useCollections();

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
      <h1 className="text-2xl font-semibold text-white">Chủ Đề</h1>

      {isLoading && <CollectionsSkeleton />}
      {error && <ErrorState />}

      {!isLoading && !error && data && data.length === 0 && (
        <EmptyState label="Chưa có bộ sưu tập nào" />
      )}

      {!isLoading && !error && data && data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => (
            <CollectionCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
