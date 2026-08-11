import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  FastForward,
  Flag,
  Heart,
  Lightbulb,
  LightbulbOff,
  Maximize,
  Play,
  Repeat,
  Share2,
  SkipBack,
  SkipForward,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CommentBlock } from "@/components/CommentBlock";
import { MovieRail } from "@/components/MovieRail";
import { ReportDialog } from "@/components/ReportDialog";
import { VideoPlayer } from "@/components/VideoPlayer";
import type {
  EpisodeServer,
  Movie,
  MovieDetail,
  ServerItem,
} from "@/apis/types/catalog-types";
import { useAuth } from "@/hooks/auth";
import { useCreateRoom } from "@/hooks/rooms";
import {
  shouldThrottleProgressSave,
  useHistory,
  useSaveProgress,
  useToggleWatchlist,
  useWatchlist,
} from "@/hooks/user-state";
import { userStateApi } from "@/apis/user-state-api";
import type { SaveProgressPayload } from "@/apis/types/user-state-types";
import { cn } from "@/lib/utils";
import { WATCH_PREF_KEYS, epLabel, trackOf } from "./constants";
import { EpisodeSidebar } from "./EpisodeList";
import { MovieDetailPanel } from "./MovieDetailPanel";
import { ServerSelector } from "./ServerSelector";
import { IconBtn, ToolBtn, ToolToggle } from "./Toolbar";
import { useStoredBoolean } from "./use-watch-prefs";

export function WatchView({
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

  // Episode + server come from the URL (?tap=&sv=) so a reload restores them.
  const search = useSearch({ from: "/xem/$slug" });
  const [serverIdx, setServerIdx] = useState(() => {
    const sv = search.sv ?? 0;
    return sv >= 0 && sv < servers.length ? sv : 0;
  });
  const currentServer: EpisodeServer | undefined = servers[serverIdx];
  const items = currentServer?.items ?? [];
  const firstEp = items[0]?.slug ?? "";
  const [episodeSlug, setEpisodeSlug] = useState(() =>
    search.tap && items.some((e) => e.slug === search.tap)
      ? search.tap
      : firstEp,
  );

  const curIdx = items.findIndex((e) => e.slug === episodeSlug);
  const currentEpisode: ServerItem | undefined = items[curIdx] ?? items[0];

  // Keep the URL in sync with the current episode/server (replace, no history
  // spam) so refreshing the page lands on the same episode.
  useEffect(() => {
    if (!episodeSlug) return;
    if (search.tap === episodeSlug && search.sv === serverIdx) return;
    void navigate({
      to: "/xem/$slug",
      params: { slug },
      search: { tap: episodeSlug, sv: serverIdx },
      replace: true,
    });
  }, [episodeSlug, serverIdx, slug, search.tap, search.sv, navigate]);

  // Resume the most recently watched episode + position for THIS movie. History
  // loads async (server) or sync (guest); apply once when it arrives, unless the
  // viewer already picked an episode.
  const { items: history } = useHistory();
  const resume = useMemo(() => {
    const rows = history
      .filter((h) => h.movie_slug === slug)
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
    return rows[0];
  }, [history, slug]);

  // If the URL already names an episode, honour it and skip history resume.
  const appliedResume = useRef(Boolean(search.tap));
  useEffect(() => {
    if (appliedResume.current || !resume) return;
    if (items.some((e) => e.slug === resume.episode_slug)) {
      appliedResume.current = true;
      setEpisodeSlug(resume.episode_slug);
    }
  }, [resume, items]);

  // Start at the cached position for the CURRENT episode (per-episode resume),
  // not just the most-recently-watched one — so opening any episode picks up
  // where you left off in that episode. VideoPlayer is keyed by episode slug, so
  // it remounts per episode and re-applies this on `onReady`.
  const startAt = useMemo(() => {
    const row = history.find(
      (h) => h.movie_slug === slug && h.episode_slug === currentEpisode?.slug,
    );
    return row?.position_sec ?? 0;
  }, [history, slug, currentEpisode?.slug]);

  const [theater, setTheater] = useStoredBoolean(
    WATCH_PREF_KEYS.theater,
    false,
  );
  const [autoPlay, setAutoPlay] = useStoredBoolean(
    WATCH_PREF_KEYS.autoPlay,
    false,
  );
  const [autoNext, setAutoNext] = useStoredBoolean(
    WATCH_PREF_KEYS.autoNext,
    true,
  );
  const [skipIntro, setSkipIntro] = useStoredBoolean(
    WATCH_PREF_KEYS.skipIntro,
    false,
  );
  const [reportOpen, setReportOpen] = useState(false);

  const { items: watchlist } = useWatchlist();
  const toggleWatchlist = useToggleWatchlist();
  const inWatchlist = watchlist.some((w) => w.movie_slug === slug);

  const saveProgress = useSaveProgress();
  const createRoom = useCreateRoom();
  const lastSavedRef = useRef<number | null>(null);
  const latestProgressRef = useRef<SaveProgressPayload | null>(null);
  const playerWrapRef = useRef<HTMLDivElement>(null);

  const snapshot = {
    name: movie.name,
    posterUrl: movie.posterUrl,
    type: movie.type,
    year: movie.year,
  };

  const groups = useMemo(() => {
    const g: Record<"sub" | "dub" | "long", { idx: number; name: string }[]> = {
      sub: [],
      dub: [],
      long: [],
    };
    servers.forEach((s, idx) =>
      g[trackOf(s.serverName)].push({ idx, name: s.serverName }),
    );
    return g;
  }, [servers]);

  const selectServer = (idx: number) => {
    setServerIdx(idx);
    const next = servers[idx];
    if (next && !next.items.some((e) => e.slug === episodeSlug)) {
      setEpisodeSlug(next.items[0]?.slug ?? "");
    }
  };

  const goPrev = () => {
    const prev = items[curIdx - 1];
    if (prev) setEpisodeSlug(prev.slug);
  };
  const goNext = () => {
    const next = items[curIdx + 1];
    if (next) setEpisodeSlug(next.slug);
  };

  const saveCurrentProgress = (payload: SaveProgressPayload, force = false) => {
    latestProgressRef.current = payload;
    if (!force && shouldThrottleProgressSave(lastSavedRef.current)) return;
    lastSavedRef.current = Date.now();
    saveProgress.save(payload);
  };

  const onTimeUpdate = (positionSec: number, durationSec: number) => {
    if (!currentEpisode) return;
    saveCurrentProgress({
      slug,
      episodeSlug: currentEpisode.slug,
      server: currentServer?.serverName ?? "",
      positionSec: Math.floor(positionSec),
      durationSec: Math.floor(durationSec),
      snapshot,
    });
  };

  useEffect(() => {
    const flushProgress = () => {
      const payload = latestProgressRef.current;
      if (!payload) return;
      if (user) userStateApi.saveProgressKeepalive(payload);
      else saveCurrentProgress(payload, true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushProgress();
    };

    window.addEventListener("pagehide", flushProgress);
    window.addEventListener("beforeunload", flushProgress);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushProgress);
      window.removeEventListener("beforeunload", flushProgress);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user, saveProgress]);

  const onShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: movie.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Đã sao chép liên kết");
      }
    } catch {
      /* cancelled */
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
        onSuccess: (room) =>
          void navigate({
            to: "/xem-chung/$code",
            params: { code: room.code },
          }),
        onError: () => toast.error("Không tạo được phòng"),
      },
    );
  };

  const expand = () => void playerWrapRef.current?.requestFullscreen?.();

  return (
    <div className="relative">
      {/* Blurred movie backdrop behind the top of the page (AniWatch ambience). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[680px] overflow-hidden"
      >
        <img
          src={movie.thumbUrl || movie.posterUrl}
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          className="h-full w-full scale-110 object-cover object-top opacity-40 blur-3xl"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-canvas/20 via-canvas/65 to-canvas" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1600px] px-4 py-6">
        {/* Lights-off dim. Lives in THIS stacking context (z-10) so the elevated
            player/toolbar (z-40) sit above it; click anywhere dim to turn back on. */}
        {theater && (
          <div
            className="fixed inset-0 z-30 cursor-pointer bg-black/85"
            onClick={() => setTheater(false)}
            aria-label="Bật đèn"
          />
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* joined block: Danh Sách Tập + player + controls (frosted over backdrop).
              backdrop-blur creates a stacking context, so lift the whole block
              above the lights-off overlay (z-30) when theater mode is on. */}
          <div className="overflow-hidden">
            <div
              className={cn(
                " rounded-lg bg-chrome/70 ring-1 ring-white/5 backdrop-blur-xl",
                theater && "relative z-40",
              )}
            >
              <div className="flex flex-col lg:flex-row pb-3">
                {/* episodes — flush against the player. On mobile the player comes
                  first (order) so it isn't buried under a long episode list. */}
                <div className="order-2 border-t border-slate/50 lg:relative lg:order-1 lg:w-[240px] lg:shrink-0 lg:overflow-hidden lg:border-t-0 lg:border-r">
                  <EpisodeSidebar
                    items={items}
                    currentSlug={currentEpisode?.slug}
                    onSelect={setEpisodeSlug}
                  />
                </div>

                {/* player + controls */}
                <div className="order-1 min-w-0 flex-1 lg:order-2">
                  <div
                    ref={playerWrapRef}
                    className={cn("relative", theater && "z-40")}
                  >
                    <div className="aspect-video w-full overflow-hidden bg-black">
                      {currentEpisode?.linkM3u8 ? (
                        <VideoPlayer
                          key={currentEpisode.slug}
                          src={currentEpisode.linkM3u8}
                          poster={movie.thumbUrl || movie.posterUrl}
                          autoPlay={autoPlay}
                          startAt={startAt}
                          onTimeUpdate={onTimeUpdate}
                          onEnded={() => autoNext && goNext()}
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-muted">
                          Không có nguồn phát
                        </div>
                      )}
                    </div>
                  </div>

                  {/* toolbar */}
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate/40 px-3 py-2.5 text-sm",
                      theater && "relative z-40",
                    )}
                  >
                    <ToolBtn
                      icon={<Maximize className="h-4 w-4" />}
                      label="Mở Rộng"
                      onClick={expand}
                    />
                    <ToolToggle
                      className="hidden lg:flex"
                      icon={
                        theater ? (
                          <Lightbulb className="h-4 w-4" />
                        ) : (
                          <LightbulbOff className="h-4 w-4" />
                        )
                      }
                      label="Đèn"
                      on={!theater}
                      onLabel="Bật"
                      offLabel="Tắt"
                      onClick={() => setTheater((v) => !v)}
                    />
                    <ToolToggle
                      className="hidden lg:flex"
                      icon={<Play className="h-4 w-4" />}
                      label="Tự Động Phát"
                      on={autoPlay}
                      onClick={() => setAutoPlay((v) => !v)}
                    />
                    <ToolToggle
                      className="hidden lg:flex"
                      icon={<Repeat className="h-4 w-4" />}
                      label="Chuyển Tập"
                      on={autoNext}
                      onClick={() => setAutoNext((v) => !v)}
                    />
                    <ToolToggle
                      className="hidden lg:flex"
                      icon={<FastForward className="h-4 w-4" />}
                      label="Bỏ Giới Thiệu"
                      on={skipIntro}
                      onClick={() => setSkipIntro((v) => !v)}
                    />

                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-full text-silver hover:bg-elevated hover:text-white">
                        <ToolBtn
                          icon={<SkipBack className="h-4 w-4" />}
                          label="Tập Trước"
                          disabledShowLabel
                          disabled={curIdx <= 0}
                          onClick={goPrev}
                        />
                      </div>
                      <div className="grid h-8 w-8 place-items-center rounded-full text-silver hover:bg-elevated hover:text-white">
                        <ToolBtn
                          icon={<SkipForward className="h-4 w-4" />}
                          label="Tập Sau"
                          disabledShowLabel
                          disabled={curIdx < 0 || curIdx >= items.length - 1}
                          onClick={goNext}
                        />
                      </div>

                      <div className="grid h-8 w-8 place-items-center rounded-full text-silver hover:bg-elevated hover:text-white">
                        <ToolBtn
                          icon={
                            <Heart
                              className={cn(
                                "h-4 w-4",
                                inWatchlist && "fill-gold text-gold",
                              )}
                            />
                          }
                          disabledShowLabel
                          label="Thêm Vào Danh Sách Xem"
                          active={inWatchlist}
                          onClick={() =>
                            toggleWatchlist.toggle(slug, snapshot, inWatchlist)
                          }
                        />
                      </div>
                      <IconBtn label="Chia Sẻ" onClick={onShare}>
                        <Share2 className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn
                        label="Báo Lỗi"
                        onClick={() => setReportOpen(true)}
                        className="hidden lg:grid"
                      >
                        <Flag className="h-4 w-4" />
                      </IconBtn>
                      <button
                        title="Xem chung"
                        onClick={startWatchParty}
                        className="hidden items-center gap-1.5 rounded-pill bg-gold px-3 py-1.5 text-sm font-medium text-[#111] hover:brightness-105 lg:flex"
                      >
                        <Users className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* server row: gold callout (left) + server selector (right) */}
                  <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-stretch">
                    <div className="flex items-center gap-1 rounded-md bg-gold/90 px-4 py-3 text-xs font-medium leading-snug text-[#111] lg:w-56 lg:shrink-0">
                      <span>
                        Bạn đang xem{" "}
                        <b>
                          {currentEpisode
                            ? epLabel(currentEpisode.name)
                            : "Tập 1"}
                        </b>
                        . Nếu lỗi, chọn server khác bên phải.
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <ServerSelector
                        groups={groups}
                        activeIdx={serverIdx}
                        onSelect={selectServer}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* comments (unchanged) */}
            <CommentBlock slug={slug} />
          </div>

          {/* col 3 — movie info (beside the player) */}
          <MovieDetailPanel movie={movie} slug={slug} />
        </div>

        {/* similar (unchanged) */}
        {similar.length > 0 && (
          <div className="mt-10">
            <MovieRail title="Phim Tương Tự" movies={similar} />
          </div>
        )}
      </div>

      {reportOpen && (
        <ReportDialog
          slug={slug}
          episodeSlug={currentEpisode?.slug}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
