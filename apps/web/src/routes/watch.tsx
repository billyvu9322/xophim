import { useNavigate, useParams } from "@tanstack/react-router";
import {
  Flag,
  Heart,
  Lightbulb,
  LightbulbOff,
  Plus,
  Share2,
  Star,
  Users,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CommentBlock } from "@/components/CommentBlock";
import { MovieRail } from "@/components/MovieRail";
import { RatingBlock } from "@/components/RatingBlock";
import { ReportDialog } from "@/components/ReportDialog";
import { VideoPlayer } from "@/components/VideoPlayer";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useAuth } from "@/hooks/auth";
import { useMovieDetail } from "@/hooks/catalog";
import { useCreateRoom } from "@/hooks/rooms";
import { shouldThrottleProgressSave, useSaveProgress, useToggleWatchlist, useWatchlist } from "@/hooks/user-state";
import type { EpisodeServer, Movie, MovieDetail } from "@/lib/catalog-types";
import { langBadges, stripHtml } from "@/lib/format";
import { cn } from "@/lib/utils";

// Track classification from a KKPhim server name.
function trackOf(serverName: string): "sub" | "dub" | "long" {
  const s = serverName.toLowerCase();
  if (s.includes("thuyết minh") || s.includes("t.minh")) return "dub";
  if (s.includes("lồng tiếng") || s.includes("l.tiếng")) return "long";
  return "sub";
}
const TRACK_LABEL: Record<"sub" | "dub" | "long", string> = {
  sub: "Phụ Đề",
  dub: "Thuyết Minh",
  long: "Lồng Tiếng",
};

export function WatchPage() {
  const { slug } = useParams({ from: "/xem/$slug" });
  const { data, isLoading, error } = useMovieDetail(slug);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState />;
  return <WatchView key={slug} slug={slug} movie={data.movie} similar={data.similar} />;
}

function WatchView({
  slug,
  movie,
  similar,
}: {
  slug: string;
  movie: MovieDetail;
  similar: Movie[];
}) {
  const navigate = useNavigate();
  const { data: user } = useAuth();
  const servers = movie.episodes;

  const [serverIdx, setServerIdx] = useState(0);
  const currentServer: EpisodeServer | undefined = servers[serverIdx];
  const firstEp = currentServer?.items[0]?.slug ?? "";
  const [episodeSlug, setEpisodeSlug] = useState(firstEp);

  const currentEpisode =
    currentServer?.items.find((e) => e.slug === episodeSlug) ?? currentServer?.items[0];

  const [theater, setTheater] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const { items: watchlist } = useWatchlist();
  const toggleWatchlist = useToggleWatchlist();
  const inWatchlist = watchlist.some((w) => w.movie_slug === slug);

  const saveProgress = useSaveProgress();
  const createRoom = useCreateRoom();
  const lastSavedRef = useRef<number | null>(null);

  const snapshot = { name: movie.name, posterUrl: movie.posterUrl, type: movie.type, year: movie.year };

  // group servers by language track for the selector
  const groups = useMemo(() => {
    const g: Record<"sub" | "dub" | "long", { idx: number; name: string }[]> = {
      sub: [],
      dub: [],
      long: [],
    };
    servers.forEach((s, idx) => g[trackOf(s.serverName)].push({ idx, name: s.serverName }));
    return g;
  }, [servers]);

  const selectServer = (idx: number) => {
    setServerIdx(idx);
    const next = servers[idx];
    if (next && !next.items.some((e) => e.slug === episodeSlug)) {
      setEpisodeSlug(next.items[0]?.slug ?? "");
    }
  };

  const onTimeUpdate = (positionSec: number, durationSec: number) => {
    if (!currentEpisode) return;
    if (shouldThrottleProgressSave(lastSavedRef.current)) return;
    lastSavedRef.current = Date.now();
    saveProgress.save({
      slug,
      episodeSlug: currentEpisode.slug,
      server: currentServer?.serverName ?? "",
      positionSec: Math.floor(positionSec),
      durationSec: Math.floor(durationSec),
      snapshot,
    });
  };

  const onShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: movie.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Đã sao chép liên kết");
      }
    } catch {
      /* user cancelled */
    }
  };

  const startWatchParty = () => {
    if (!user) {
      toast.error("Đăng nhập để tạo phòng Xem Chung");
      return;
    }
    createRoom.mutate(
      { slug, episodeSlug: currentEpisode?.slug ?? "full" },
      {
        onSuccess: (room) => void navigate({ to: "/xem-chung/$code", params: { code: room.code } }),
        onError: () => toast.error("Không tạo được phòng"),
      },
    );
  };

  const badges = langBadges(movie.lang);
  const isSeries = (currentServer?.items.length ?? 0) > 1;

  return (
    <div className="relative">
      {theater && <div className="fixed inset-0 z-30 bg-black/85" />}

      <div className="mx-auto max-w-[1600px] px-4 py-6">
        {/* player */}
        <div className={cn("relative", theater && "z-40")}>
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            {currentEpisode?.linkM3u8 ? (
              <VideoPlayer
                src={currentEpisode.linkM3u8}
                poster={movie.thumbUrl || movie.posterUrl}
                onTimeUpdate={onTimeUpdate}
              />
            ) : (
              <div className="grid h-full place-items-center text-muted">Không có nguồn phát</div>
            )}
          </div>
        </div>

        {/* action bar */}
        <div className={cn("mt-3 flex flex-wrap items-center gap-2", theater && "relative z-40")}>
          <ActionButton
            icon={<Heart className={cn("h-5 w-5", inWatchlist && "fill-gold text-gold")} />}
            label="Yêu Thích"
            active={inWatchlist}
            onClick={() => toggleWatchlist.toggle(slug, snapshot, inWatchlist)}
          />
          <ActionButton
            icon={<Plus className="h-5 w-5" />}
            label="Bộ Sưu Tập"
            onClick={() => toast("Tính năng đang phát triển")}
          />
          <ActionButton icon={<Share2 className="h-5 w-5" />} label="Chia Sẻ" onClick={onShare} />
          <ActionButton
            icon={<Users className="h-5 w-5" />}
            label="Xem Chung"
            onClick={startWatchParty}
          />
          <ActionButton
            icon={<Flag className="h-5 w-5" />}
            label="Báo Lỗi"
            onClick={() => setReportOpen(true)}
          />
          <ActionButton
            icon={theater ? <Lightbulb className="h-5 w-5" /> : <LightbulbOff className="h-5 w-5" />}
            label={theater ? "Bật Đèn" : "Tắt Đèn"}
            active={theater}
            onClick={() => setTheater((v) => !v)}
          />
        </div>

        {/* details: left content + right rail (Chọn Server + Đánh Giá) */}
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_340px]">
          {/* left column */}
          <div className="min-w-0 space-y-6">
            <div className="space-y-3">
              <h1 className="text-2xl font-bold text-white sm:text-3xl">{movie.name}</h1>
              {movie.originName && <p className="text-sm text-muted">{movie.originName}</p>}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {movie.year != null && <Meta>{movie.year}</Meta>}
                {movie.quality && <Meta>{movie.quality}</Meta>}
                {movie.time && <Meta>{movie.time}</Meta>}
                {movie.episodeCurrent && <Meta>{movie.episodeCurrent}</Meta>}
                {movie.score.imdb != null && (
                  <span className="flex items-center gap-1 rounded bg-black/50 px-2 py-1 text-white">
                    <Star className="h-3 w-3 fill-gold text-gold" /> IMDb {movie.score.imdb.toFixed(1)}
                  </span>
                )}
                {movie.score.tmdb != null && (
                  <span className="flex items-center gap-1 rounded bg-black/50 px-2 py-1 text-white">
                    <Star className="h-3 w-3 fill-gold text-gold" /> TMDb {movie.score.tmdb.toFixed(1)}
                  </span>
                )}
                {badges.map((b) => (
                  <span
                    key={b.label}
                    className={cn(
                      "rounded-sm px-1.5 py-1 font-semibold text-[#111]",
                      b.kind === "sub" ? "bg-sub" : "bg-dub",
                    )}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
              {movie.categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {movie.categories.map((c) => (
                    <span key={c.slug} className="rounded-pill bg-chip px-3 py-1 text-xs text-silver">
                      {c.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* episode grid (series) */}
            {isSeries && currentServer && (
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-white">Danh Sách Tập</h2>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                  {currentServer.items.map((ep) => (
                    <button
                      key={ep.slug}
                      onClick={() => setEpisodeSlug(ep.slug)}
                      className={cn(
                        "truncate rounded-md px-2 py-2 text-sm transition-colors",
                        ep.slug === currentEpisode?.slug
                          ? "bg-gold font-medium text-[#111]"
                          : "bg-elevated text-silver hover:bg-chip hover:text-white",
                      )}
                    >
                      {ep.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {movie.content && (
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-white">Nội Dung</h2>
                <p className="text-sm leading-relaxed text-silver">{stripHtml(movie.content)}</p>
              </div>
            )}

            <dl className="space-y-2 text-sm">
              {movie.directors.length > 0 && (
                <InfoRow label="Đạo diễn" value={movie.directors.join(", ")} />
              )}
              {movie.actors.length > 0 && (
                <InfoRow label="Diễn viên" value={movie.actors.join(", ")} />
              )}
              {movie.countries.length > 0 && (
                <InfoRow label="Quốc gia" value={movie.countries.map((c) => c.name).join(", ")} />
              )}
              {movie.status && <InfoRow label="Trạng thái" value={movie.status} />}
            </dl>
          </div>

          {/* right rail */}
          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-lg bg-chrome p-4">
              <ServerSelector groups={groups} activeIdx={serverIdx} onSelect={selectServer} />
            </div>
            <RatingBlock slug={slug} />
          </div>
        </div>

        {/* comments */}
        <div className="mt-10">
          <CommentBlock slug={slug} />
        </div>

        {/* similar */}
        {similar.length > 0 && (
          <div className="mt-10">
            <MovieRail title="Phim Tương Tự" movies={similar} />
          </div>
        )}
      </div>

      {reportOpen && (
        <ReportDialog slug={slug} episodeSlug={currentEpisode?.slug} onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-pill px-3 py-2 text-sm transition-colors",
        active ? "text-gold" : "text-muted hover:bg-elevated hover:text-white",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-white/10 px-2 py-1 text-white">{children}</span>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted">{label}:</dt>
      <dd className="text-silver">{value}</dd>
    </div>
  );
}

function ServerSelector({
  groups,
  activeIdx,
  onSelect,
}: {
  groups: Record<"sub" | "dub" | "long", { idx: number; name: string }[]>;
  activeIdx: number;
  onSelect: (idx: number) => void;
}) {
  const tracks: ("sub" | "dub" | "long")[] = ["sub", "dub", "long"];
  const hasAny = tracks.some((t) => groups[t].length > 0);
  if (!hasAny) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-white">Chọn Server</h2>
      {tracks.map((t) =>
        groups[t].length === 0 ? null : (
          <div key={t} className="space-y-1.5">
            <p className="text-xs uppercase tracking-wide text-muted">{TRACK_LABEL[t]}</p>
            <div className="flex flex-wrap gap-2">
              {groups[t].map((s) => (
                <button
                  key={s.idx}
                  onClick={() => onSelect(s.idx)}
                  className={cn(
                    "rounded-pill px-4 py-1.5 text-sm transition-colors",
                    s.idx === activeIdx
                      ? "bg-gold font-medium text-[#111]"
                      : "bg-chip text-silver hover:text-white",
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
