import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  FastForward,
  Flag,
  Heart,
  Lightbulb,
  LightbulbOff,
  Maximize,
  Play,
  Repeat,
  Search,
  Share2,
  SkipBack,
  SkipForward,
  Star,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CommentBlock } from "@/components/CommentBlock";
import { MovieRail } from "@/components/MovieRail";
import { RatingBlock } from "@/components/RatingBlock";
import { ReportDialog } from "@/components/ReportDialog";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Poster } from "@/components/ui/Poster";
import { ErrorState } from "@/components/ui/states";
import { WatchSkeleton } from "@/components/ui/skeletons";
import { useAuth } from "@/hooks/auth";
import { useMovieDetail } from "@/hooks/catalog";
import { useCreateRoom } from "@/hooks/rooms";
import {
  shouldThrottleProgressSave,
  useHistory,
  useSaveProgress,
  useToggleWatchlist,
  useWatchlist,
} from "@/hooks/user-state";
import type {
  EpisodeServer,
  Movie,
  MovieDetail,
  ServerItem,
} from "@/lib/catalog-types";
import { langBadges, stripHtml, typeLabel } from "@/lib/format";
import { userStateApi } from "@/lib/user-state-api";
import type { SaveProgressPayload } from "@/lib/user-state-types";
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
const TRACK_TEXT: Record<"sub" | "dub" | "long", string> = {
  sub: "text-sub",
  dub: "text-dub",
  long: "text-silver",
};

const WATCH_PREF_KEYS = {
  theater: "xophim.watch.theater",
  autoPlay: "xophim.watch.autoPlay",
  autoNext: "xophim.watch.autoNext",
  skipIntro: "xophim.watch.skipIntro",
} as const;

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function useStoredBoolean(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => readStoredBoolean(key, fallback));
  useEffect(() => {
    window.localStorage.setItem(key, String(value));
  }, [key, value]);
  return [value, setValue] as const;
}

// "1" → "Tập 1"; leave non-numeric names ("Full", "OVA") as-is.
function epLabel(name: string): string {
  return /^\d+$/.test(name.trim()) ? `Tập ${name.trim()}` : name;
}

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

  const badges = langBadges(movie.lang);

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
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="w-48 max-w-[120px] overflow-hidden rounded lg:w-full">
              <div className="aspect-[2/3]">
                <Poster
                  src={movie.posterUrl}
                  alt={movie.name}
                  label={movie.name}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-xl font-bold text-white">{movie.name}</h1>
              {movie.originName && (
                <p className="text-sm text-muted">{movie.originName}</p>
              )}

              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {movie.score.imdb != null && (
                  <span className="flex items-center gap-1 rounded bg-black/50 px-2 py-1 text-white">
                    <Star className="h-3 w-3 fill-gold text-gold" />{" "}
                    {movie.score.imdb.toFixed(1)}
                  </span>
                )}
                {movie.quality && (
                  <span className="rounded bg-gold px-1.5 py-1 font-bold text-[#111]">
                    {movie.quality}
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
                <span className="rounded bg-chip px-1.5 py-1 text-silver">
                  {typeLabel(movie.type)}
                </span>
              </div>

              {movie.categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {movie.categories.map((c) => (
                    <span
                      key={c.slug}
                      className="rounded-pill bg-chip px-2.5 py-1 text-xs text-silver"
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              )}

              <Synopsis text={movie.content ? stripHtml(movie.content) : ""} />

              <dl className="space-y-1.5 text-sm">
                {movie.directors.length > 0 && (
                  <InfoRow
                    label="Đạo diễn"
                    value={movie.directors.join(", ")}
                  />
                )}
                {movie.actors.length > 0 && (
                  <InfoRow label="Diễn viên" value={movie.actors.join(", ")} />
                )}
                {movie.countries.length > 0 && (
                  <InfoRow
                    label="Quốc gia"
                    value={movie.countries.map((c) => c.name).join(", ")}
                  />
                )}
                {movie.time && (
                  <InfoRow label="Thời lượng" value={movie.time} />
                )}
                {movie.status && (
                  <InfoRow label="Trạng thái" value={movie.status} />
                )}
              </dl>
            </div>

            <RatingBlock slug={slug} />
          </aside>
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

// ---------------------------------------------------------------------------
// Episode sidebar — searchable vertical list; active row highlighted + play icon.
// ---------------------------------------------------------------------------
function EpisodeSidebar({
  items,
  currentSlug,
  onSelect,
}: {
  items: ServerItem[];
  currentSlug: string | undefined;
  onSelect: (slug: string) => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query
    ? items.filter((e) => e.name.toLowerCase().includes(query))
    : items;

  return (
    <div className="max-h-[320px] overflow-y-auto p-3 lg:absolute lg:inset-0 lg:max-h-none">
      <h2 className="mb-2 text-sm font-semibold text-white">Danh Sách Tập</h2>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Số tập"
          className="h-9 w-full rounded-md bg-elevated pl-8 pr-3 text-sm text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold"
        />
      </div>
      <ul className="space-y-1">
        {filtered.map((ep, i) => {
          const active = ep.slug === currentSlug;
          return (
            <li key={ep.slug}>
              <button
                onClick={() => onSelect(ep.slug)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 border-l-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-gold bg-elevated text-white"
                    : "border-transparent text-silver hover:bg-elevated/60 hover:text-white",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-xs text-muted">{i + 1}</span>
                  <span className="truncate">{epLabel(ep.name)}</span>
                </span>
                {active && (
                  <Play className="h-4 w-4 shrink-0 fill-gold text-gold" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar helpers
// ---------------------------------------------------------------------------
function ToolBtn({
  icon,
  label,
  active,
  disabled,
  onClick,
  className,
  disabledShowLabel,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  disabledShowLabel?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "flex items-center gap-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active ? "text-gold" : "text-silver hover:text-gold",
        className,
      )}
    >
      {icon}
      {!disabledShowLabel && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

function ToolToggle({
  icon,
  label,
  on,
  onLabel = "Bật",
  offLabel = "Tắt",
  onClick,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onLabel?: string;
  offLabel?: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 text-silver hover:text-white",
        className,
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}:</span>
      <span className={cn("font-medium", on ? "text-gold" : "text-muted")}>
        {on ? onLabel : offLabel}
      </span>
    </button>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  className,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-full text-silver hover:bg-elevated hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

// Synopsis with a 4-line clamp + "Xem thêm / Thu gọn" toggle (like View detail).
function Synopsis({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return <p className="text-sm text-muted">Chưa có mô tả.</p>;
  const long = text.length > 160;
  return (
    <div className="space-y-1">
      <p
        className={cn(
          "text-sm leading-relaxed text-silver",
          long && !open && "line-clamp-6",
        )}
      >
        {text}
      </p>
      {long && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-semibold text-gold hover:underline"
        >
          {open ? "Thu gọn" : "Xem thêm"}
        </button>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted">{label}:</dt>
      <dd className="text-silver">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Server selector — grouped by language track, colored track labels.
// ---------------------------------------------------------------------------
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
  if (!tracks.some((t) => groups[t].length > 0)) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-white">Chọn Server</h2>
      {tracks.map((t) =>
        groups[t].length === 0 ? null : (
          <div key={t} className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-xs font-semibold uppercase tracking-wide",
                TRACK_TEXT[t],
              )}
            >
              {TRACK_LABEL[t]}
            </span>
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
        ),
      )}
    </div>
  );
}
