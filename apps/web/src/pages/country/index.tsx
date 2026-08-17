import { Link, useParams } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { useMemo } from "react";
import { InfiniteMovieGrid } from "@/components/InfiniteMovieGrid";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { MovieGridSkeleton } from "@/components/ui/skeletons";
import { useInfiniteCountryList, useFilters } from "@/hooks/catalog";
import { useSeo } from "@/hooks/useSeo";
import type { ListParams } from "@/apis/catalog-api";

// Known country slugs → display title. Falls back to the taxonomy name from
// /filters, then a prettified slug, so any country slug still renders a heading.
const COUNTRY_LABELS: Record<string, string> = {
  "han-quoc": "Phim Hàn Quốc",
  "trung-quoc": "Phim Trung Quốc",
};

function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function CountryBrowsePage() {
  const { slug } = useParams({ from: "/quoc-gia/$slug" });
  const { data: filters } = useFilters();

  const listParams: Omit<ListParams, "page"> = {
    limit: 28,
    sort_field: "modified.time",
    sort_type: "desc",
  };

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteCountryList(slug, listParams);

  // Dedupe by slug — KKPhim's modified.time pagination can repeat a movie across
  // consecutive pages, duplicating React keys and jumping the grid on load-more.
  const movies = useMemo(() => {
    const all = data?.pages.flatMap((p) => p.items) ?? [];
    const seen = new Set<string>();
    return all.filter((m) => (seen.has(m.slug) ? false : (seen.add(m.slug), true)));
  }, [data]);

  const countryName = filters?.countries.find((c) => c.slug === slug)?.name;
  const title =
    COUNTRY_LABELS[slug] ??
    (countryName ? `Phim ${countryName}` : prettifySlug(slug));

  useSeo({
    title: `${title} — Xem online miễn phí`,
    description: `Tuyển tập ${title.toLowerCase()} hay nhất, cập nhật liên tục, Vietsub & thuyết minh chất lượng cao.`,
  });

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        {/* Same "Bộ Lọc" affordance as the /list/$type category pages, carrying
            this country as the preset filter. */}
        <Link
          to="/filter"
          search={{
            type: "phim-moi",
            country: slug,
            category: "",
            year: "",
            lang: "",
            sort: 0,
            page: 1,
          }}
          className="inline-flex w-fit items-center gap-2 rounded-md bg-chrome/60 px-4 py-2 text-sm font-semibold text-gold ring-1 ring-white/5 transition-colors hover:bg-elevated"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Bộ Lọc
        </Link>
      </div>

      {isLoading ? (
        <MovieGridSkeleton />
      ) : isError ? (
        <ErrorState />
      ) : movies.length === 0 ? (
        <EmptyState label="Không tìm thấy phim nào" />
      ) : (
        <InfiniteMovieGrid
          movies={movies}
          hasMore={Boolean(hasNextPage)}
          loadMore={() => void fetchNextPage()}
          isFetching={isFetchingNextPage}
        />
      )}
    </div>
  );
}
