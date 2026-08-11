import { useNavigate } from "@tanstack/react-router";
import { LogOut, Send, Share2, Users, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/VideoPlayer";
import { Button } from "@/components/ui/Button";
import { useMovieDetail } from "@/hooks/catalog";
import { useWatchParty } from "@/hooks/watch-party";
import type { MovieDetail } from "@/apis/types/catalog-types";
import { timeAgo } from "@/lib/format";

export function findStream(
  movie: MovieDetail | undefined,
  episodeSlug: string,
): string {
  if (!movie) return "";
  for (const server of movie.episodes) {
    const ep = server.items.find((e) => e.slug === episodeSlug);
    if (ep?.linkM3u8) return ep.linkM3u8;
  }
  return movie.episodes[0]?.items[0]?.linkM3u8 ?? "";
}

export function RoomView({
  code,
  movieSlug,
  episodeSlug,
  name,
}: {
  code: string;
  movieSlug: string;
  episodeSlug: string;
  name: string;
}) {
  const navigate = useNavigate();
  const { data: detail } = useMovieDetail(movieSlug);
  const { members, chat, playbackState, connected, sendChat, hostControls } =
    useWatchParty(code, name);

  const playerRef = useRef<VideoPlayerHandle>(null);
  const applyingRef = useRef(false); // suppress echo when applying server state
  const [message, setMessage] = useState("");

  const src = useMemo(
    () => findStream(detail?.movie, episodeSlug),
    [detail, episodeSlug],
  );

  // Apply the authoritative server playback state to the local video. The
  // applying flag stops the resulting play/pause/seeked events from being
  // re-broadcast (which would loop). Non-hosts get their local actions denied
  // server-side and thus snapped back here.
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    applyingRef.current = true;
    if (Math.abs(p.currentTime() - playbackState.positionSec) > 2) {
      p.seek(playbackState.positionSec);
    }
    if (playbackState.playing) p.play();
    else p.pause();
    const t = setTimeout(() => {
      applyingRef.current = false;
    }, 300);
    return () => clearTimeout(t);
  }, [playbackState]);

  const guard = (fn: () => void) => {
    if (!applyingRef.current) fn();
  };

  const shareRoom = async () => {
    const url = window.location.href;
    try {
      if (navigator.share)
        await navigator.share({ title: "Xem Chung XoPhim", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Đã sao chép liên kết phòng");
      }
    } catch {
      /* cancelled */
    }
  };

  const submitChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (text) {
      sendChat(text);
      setMessage("");
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-white">Xem Chung</h1>
          <span className="rounded-pill bg-elevated px-3 py-1 font-mono text-sm text-gold">
            {code}
          </span>
          <span
            className={
              connected
                ? "flex items-center gap-1 text-xs text-sub"
                : "flex items-center gap-1 text-xs text-muted"
            }
          >
            {connected ? (
              <Wifi className="h-4 w-4" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}
            {connected ? "Đã kết nối" : "Đang kết nối..."}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={shareRoom}>
            <Share2 className="h-4 w-4" /> Mời Bạn Bè
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({ to: "/xem/$slug", params: { slug: movieSlug } })
            }
          >
            <LogOut className="h-4 w-4" /> Rời Phòng
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* player */}
        <div className="space-y-3">
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            {src ? (
              <VideoPlayer
                ref={playerRef}
                src={src}
                poster={detail?.movie.thumbUrl}
                autoPlay={false}
                onPlay={() =>
                  guard(() =>
                    hostControls.play(playerRef.current?.currentTime() ?? 0),
                  )
                }
                onPause={() =>
                  guard(() =>
                    hostControls.pause(playerRef.current?.currentTime() ?? 0),
                  )
                }
                onSeeked={(sec) => guard(() => hostControls.seek(sec))}
              />
            ) : (
              <div className="grid h-full place-items-center text-muted">
                Đang tải phim...
              </div>
            )}
          </div>
          {detail?.movie && (
            <h2 className="text-lg font-medium text-white">
              {detail.movie.name}
            </h2>
          )}
          <p className="text-xs text-muted">
            Chủ phòng điều khiển phát/tạm dừng/tua cho tất cả mọi người.
          </p>
        </div>

        {/* side panel: members + chat */}
        <aside className="flex h-[70vh] flex-col rounded-lg bg-chrome">
          <div className="flex items-center gap-2 border-b border-slate/40 px-4 py-3">
            <Users className="h-4 w-4 text-gold" />
            <span className="text-sm font-medium text-white">
              Thành Viên ({members.length})
            </span>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-slate/40 px-4 py-2">
            {members.map((m) => (
              <span
                key={m.id}
                className="shrink-0 rounded-pill bg-elevated px-2.5 py-1 text-xs text-silver"
              >
                {m.name}
              </span>
            ))}
          </div>

          {/* chat */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {chat.length === 0 ? (
              <p className="text-center text-xs text-muted">Chưa có tin nhắn</p>
            ) : (
              chat.map((c, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-gold">{c.from}</span>{" "}
                  <span className="text-[10px] text-muted">
                    {timeAgo(c.at)}
                  </span>
                  <p className="text-silver">{c.text}</p>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={submitChat}
            className="flex gap-2 border-t border-slate/40 p-3"
          >
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Nhập tin nhắn..."
              className="h-9 flex-1 rounded-md bg-elevated px-3 text-sm text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold"
            />
            <Button size="icon" type="submit" aria-label="Gửi">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </aside>
      </div>
    </div>
  );
}
