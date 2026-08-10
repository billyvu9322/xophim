import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { MovieRail } from "@/components/MovieRail";
import { ErrorState } from "@/components/ui/states";
import { HomeSkeleton } from "@/components/ui/skeletons";
import { useHome } from "@/hooks/catalog";
import { ContinueWatching } from "./ContinueWatching";
import { Spotlight } from "./Spotlight";
import { Top10 } from "./Top10";

export function HomePage() {
  const { data, isLoading, error } = useHome();

  if (isLoading) return <HomeSkeleton />;
  if (error || !data) return <ErrorState />;

  const spotlight = data.latest.slice(0, 5);
  const trending = data.latest.slice(0, 10);

  return (
    <div>
      <Spotlight movies={spotlight} />
      <div className="mx-auto max-w-[1600px] px-4 py-6">
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* main column */}
          <div className="min-w-0 flex-1 space-y-8">
            <ContinueWatching />

            <MovieRail title="Hiện đang thịnh hành" movies={trending} ranked />
            <MovieRail
              title="Phim Mới Cập Nhật"
              movies={data.latest}
              action={
                <Link
                  to="/list/$type"
                  params={{ type: "phim-moi" }}
                  className="flex items-center text-sm text-muted hover:text-gold"
                >
                  Xem tất cả <ChevronRight className="h-4 w-4" />
                </Link>
              }
            />
            <MovieRail
              title="Phim Bộ Mới"
              movies={data.phimBo}
              action={
                <Link
                  to="/list/$type"
                  params={{ type: "phim-bo" }}
                  className="flex items-center text-sm text-muted hover:text-gold"
                >
                  Xem tất cả <ChevronRight className="h-4 w-4" />
                </Link>
              }
            />
            <MovieRail
              title="Phim Lẻ Mới"
              movies={data.phimLe}
              action={
                <Link
                  to="/list/$type"
                  params={{ type: "phim-le" }}
                  className="flex items-center text-sm text-muted hover:text-gold"
                >
                  Xem tất cả <ChevronRight className="h-4 w-4" />
                </Link>
              }
            />
            <MovieRail
              title="Hoạt Hình"
              movies={data.hoatHinh}
              action={
                <Link
                  to="/list/$type"
                  params={{ type: "hoat-hinh" }}
                  className="flex items-center text-sm text-muted hover:text-gold"
                >
                  Xem tất cả <ChevronRight className="h-4 w-4" />
                </Link>
              }
            />
          </div>

          {/* right Top 10 sidebar */}
          <Top10
            tabs={{
              "Hôm Nay": data.latest,
              Tuần: data.phimBo,
              Tháng: data.phimLe,
            }}
          />
        </div>
      </div>
    </div>
  );
}
