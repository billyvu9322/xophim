import ReactPlayer from "react-player/lazy";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cleanupPlaylist } from "@/lib/playlist-api";

const ENABLE_PLAYLIST_CLEANUP =
  import.meta.env.VITE_ENABLE_PLAYLIST_CLEANUP === "true";

export interface VideoPlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (sec: number) => void;
  currentTime: () => number;
}

interface VideoPlayerProps {
  /** HLS .m3u8 stream URL (episodes[].server_data[].link_m3u8). */
  src: string;
  poster?: string;
  autoPlay?: boolean;
  startAt?: number;
  onTimeUpdate?: (positionSec: number, durationSec: number) => void;
  onEnded?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onSeeked?: (positionSec: number) => void;
  className?: string;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// --- Icons (inline SVG, no external icon package needed) ---------------

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
function Rewind10Icon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-5 w-5"
    >
      <path
        d="M12 6V2L7 6l5 4V7a5 5 0 1 1-5 5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="12"
        y="16.5"
        fontSize="6.5"
        fill="currentColor"
        stroke="none"
        textAnchor="middle"
      >
        10
      </text>
    </svg>
  );
}
function Forward10Icon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-5 w-5"
    >
      <path
        d="M12 6V2l5 4-5 4V7a5 5 0 1 0 5 5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="12"
        y="16.5"
        fontSize="6.5"
        fill="currentColor"
        stroke="none"
        textAnchor="middle"
      >
        10
      </text>
    </svg>
  );
}
function VolumeIcon({ level }: { level: number }) {
  if (level <= 0)
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M16.5 12 19 9.5l-1-1L15.5 11 13 8.5l-1 1 2.5 2.5L12 14.5l1 1 2.5-2.5 2.5 2.5 1-1z" />
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M3 9v6h4l5 5V4L7 9H3z" />
      {level > 0.02 && (
        <path
          d="M16.5 8.5a5 5 0 0 1 0 7"
          stroke="currentColor"
          strokeWidth={1.8}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {level > 0.55 && (
        <path
          d="M19 6a8.5 8.5 0 0 1 0 12"
          stroke="currentColor"
          strokeWidth={1.8}
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
function PipIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-5 w-5"
    >
      <rect x="3" y="4" width="18" height="14" rx="1.5" />
      <rect
        x="12"
        y="11"
        width="7"
        height="5"
        rx="1"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
function FullscreenEnterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-5 w-5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
function FullscreenExitIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-5 w-5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 3v3a2 2 0 0 1-2 2H4M15 3v3a2 2 0 0 0 2 2h3M9 21v-3a2 2 0 0 0-2-2H4M15 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

// Movie player wrapper over react-player. Keeps the old imperative API for
// watch-party sync while using a fully custom control surface (no native
// browser controls) so the seek bar, skip buttons, and volume slider are
// styled consistently and never sit on top of subtitles.
export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer(
    {
      src,
      poster,
      autoPlay = false,
      startAt = 0,
      onTimeUpdate,
      onEnded,
      onPlay,
      onPause,
      onSeeked,
      className,
    },
    ref,
  ) {
    const playerRef = useRef<ReactPlayer>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const durationRef = useRef(0);
    const appliedStartAtRef = useRef<number | null>(null);
    const hasPlaybackProgressRef = useRef(false);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const seekingRef = useRef(false);

    const [playing, setPlaying] = useState(autoPlay);
    const [playbackSrc, setPlaybackSrc] = useState(src);
    const [played, setPlayed] = useState(0);
    const [duration, setDuration] = useState(0);
    const [seekPreview, setSeekPreview] = useState<number | null>(null);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(autoPlay);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [buffering, setBuffering] = useState(false);

    // --- stream source (with optional playlist cleanup) -----------------

    useEffect(() => {
      if (!ENABLE_PLAYLIST_CLEANUP || !/\.m3u8?(\?.*)?$/i.test(src)) {
        setPlaybackSrc(src);
        return;
      }

      const controller = new AbortController();
      let blobUrl: string | null = null;
      setPlaybackSrc(src);

      cleanupPlaylist(src, controller.signal)
        .then((content) => {
          if (controller.signal.aborted) return;
          blobUrl = URL.createObjectURL(
            new Blob([content], { type: "application/vnd.apple.mpegurl" }),
          );
          setPlaybackSrc(blobUrl);
        })
        .catch(() => {
          if (!controller.signal.aborted) setPlaybackSrc(src);
        });

      return () => {
        controller.abort();
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      };
    }, [src]);

    useEffect(() => {
      appliedStartAtRef.current = null;
      hasPlaybackProgressRef.current = false;
      setPlaying(autoPlay);
      setMuted(autoPlay);
    }, [autoPlay, src]);

    useEffect(() => {
      if (
        appliedStartAtRef.current === startAt ||
        hasPlaybackProgressRef.current ||
        startAt <= 0
      )
        return;
      const current = playerRef.current?.getCurrentTime() ?? 0;
      if (Math.abs(current - startAt) <= 2) {
        appliedStartAtRef.current = startAt;
        return;
      }
      playerRef.current?.seekTo(startAt, "seconds");
      appliedStartAtRef.current = startAt;
    }, [startAt]);

    useImperativeHandle(ref, () => ({
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      seek: (sec: number) => {
        playerRef.current?.seekTo(sec, "seconds");
        setPlayed(sec);
      },
      currentTime: () => playerRef.current?.getCurrentTime() ?? 0,
    }));

    // --- fullscreen state sync ------------------------------------------

    useEffect(() => {
      const handler = () =>
        setIsFullscreen(document.fullscreenElement === containerRef.current);
      document.addEventListener("fullscreenchange", handler);
      return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    // --- auto-hide control bar ------------------------------------------

    const scheduleHide = useCallback(() => {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        if (playing) setControlsVisible(false);
      }, 2800);
    }, [playing]);

    const wakeControls = useCallback(() => {
      setControlsVisible(true);
      scheduleHide();
    }, [scheduleHide]);

    useEffect(() => {
      if (!playing) {
        clearTimeout(hideTimerRef.current);
        setControlsVisible(true);
      } else {
        scheduleHide();
      }
      return () => clearTimeout(hideTimerRef.current);
    }, [playing, scheduleHide]);

    // --- seeking helpers ---------------------------------------------

    const seekTo = useCallback(
      (sec: number) => {
        const clamped = Math.max(0, Math.min(duration || Infinity, sec));
        playerRef.current?.seekTo(clamped, "seconds");
        setPlayed(clamped);
        onSeeked?.(clamped);
        onTimeUpdate?.(clamped, durationRef.current || duration);
      },
      [duration, onSeeked, onTimeUpdate],
    );

    const seekRelative = useCallback(
      (deltaSec: number) =>
        seekTo((playerRef.current?.getCurrentTime() ?? played) + deltaSec),
      [played, seekTo],
    );

    // --- fullscreen / pip actions ---------------------------------------

    const toggleFullscreen = useCallback(() => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current?.requestFullscreen();
      }
    }, []);

    const togglePip = () => {
      const internal = playerRef.current?.getInternalPlayer() as
        | HTMLVideoElement
        | undefined;
      if (!internal) return;
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        internal.requestPictureInPicture().catch(() => {});
      }
    };

    // --- global keyboard shortcuts ---------------------------------------
    // Bound on window so arrow-key seeking works without clicking the
    // player to focus it. Arrow keys deliberately do NOT wake the control
    // bar — seeking should stay unobtrusive; play/pause and fullscreen
    // still reveal it so the user can see the resulting state.
    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        // Don't hijack typing in unrelated inputs/textareas elsewhere on the page.
        if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable)
          return;

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          seekRelative(-10);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          seekRelative(10);
        } else if (event.key === " " || event.key === "k") {
          event.preventDefault();
          setPlaying((v) => !v);
          wakeControls();
        } else if (event.key === "m") {
          setMuted((v) => !v);
        } else if (event.key === "f") {
          toggleFullscreen();
          wakeControls();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [seekRelative, toggleFullscreen, wakeControls]);

    return (
      <div
        ref={containerRef}
        className={className ?? "relative h-full w-full bg-black"}
        onMouseMove={wakeControls}
        onMouseLeave={() => playing && setControlsVisible(false)}
        onClick={() => setPlaying((v) => !v)}
      >
        <ReactPlayer
          ref={playerRef}
          url={playbackSrc}
          width="100%"
          height="100%"
          controls={false}
          pip
          playsinline
          playing={playing}
          volume={volume}
          muted={muted}
          config={{
            file: {
              forceHLS: false,
              attributes: {
                poster,
                preload: "metadata",
                playsInline: true,
                controlsList: "nodownload",
              },
            },
          }}
          onReady={() => {
            if (appliedStartAtRef.current !== startAt && startAt > 0) {
              playerRef.current?.seekTo(startAt, "seconds");
              appliedStartAtRef.current = startAt;
            }
          }}
          onBuffer={() => setBuffering(true)}
          onBufferEnd={() => setBuffering(false)}
          onDuration={(d) => {
            durationRef.current = d;
            setDuration(d);
          }}
          onProgress={({ playedSeconds }) => {
            if (playedSeconds > 3) hasPlaybackProgressRef.current = true;
            if (!seekingRef.current) setPlayed(playedSeconds);
            const playerDuration = playerRef.current?.getDuration() ?? 0;
            const d =
              durationRef.current ||
              (Number.isFinite(playerDuration) ? playerDuration : 0);
            if (onTimeUpdate && playedSeconds > 0)
              onTimeUpdate(playedSeconds, d);
          }}
          onPlay={() => {
            setPlaying(true);
            onPlay?.();
          }}
          onPause={() => {
            setPlaying(false);
            onPause?.();
          }}
          onSeek={(seconds) => onSeeked?.(seconds)}
          onEnded={onEnded}
        />

        {/* Center buffering / big play affordance */}
        {buffering && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}

        {/* Bottom gradient — fades from transparent to black, tall enough
            to sit under subtitles without covering them, and only shows
            opaque near the very bottom where the control bar lives. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-36 transition-opacity duration-300"
          style={{
            opacity: controlsVisible ? 1 : 0,
            background:
              "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0) 100%)",
          }}
        />

        {/* Subtitle layer placeholder — keep your subtitle renderer's
            bottom offset in sync with the control bar so cues never
            sit under it. Raise this when controls are visible. */}
        {/* <SubtitleLayer style={{ bottom: controlsVisible ? 88 : 32 }} /> */}

        {/* Control bar */}
        <div
          className="absolute inset-x-0 bottom-0 select-none px-3 pb-2 transition-opacity duration-300 sm:px-4 sm:pb-3"
          style={{
            opacity: controlsVisible ? 1 : 0,
            pointerEvents: controlsVisible ? "auto" : "none",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Seek bar */}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={seekPreview ?? played}
            onChange={(e) => {
              seekingRef.current = true;
              setSeekPreview(Number(e.target.value));
            }}
            onMouseUp={(e) => {
              seekingRef.current = false;
              const v = Number((e.target as HTMLInputElement).value);
              setSeekPreview(null);
              seekTo(v);
            }}
            onTouchEnd={(e) => {
              seekingRef.current = false;
              const v = Number((e.target as HTMLInputElement).value);
              setSeekPreview(null);
              seekTo(v);
            }}
            className="video-seek h-1 w-full cursor-pointer appearance-none rounded-full bg-white/25"
            style={{
              backgroundImage: `linear-gradient(to right, #ef4444 ${
                duration ? ((seekPreview ?? played) / duration) * 100 : 0
              }%, rgba(255,255,255,0.25) 0%)`,
            }}
          />

          <div className="mt-1.5 flex items-center justify-between text-white">
            <div className="flex items-center gap-3 sm:gap-4">
              <button
                type="button"
                aria-label={playing ? "Tạm dừng" : "Phát"}
                onClick={() => setPlaying((v) => !v)}
                className="hover:opacity-80"
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button
                type="button"
                aria-label="Tua lùi 10 giây"
                onClick={() => seekRelative(-10)}
                className="hover:opacity-80"
              >
                <Rewind10Icon />
              </button>
              <button
                type="button"
                aria-label="Tua tới 10 giây"
                onClick={() => seekRelative(10)}
                className="hover:opacity-80"
              >
                <Forward10Icon />
              </button>

              <div className="group flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={muted ? "Bật tiếng" : "Tắt tiếng"}
                  onClick={() => setMuted((v) => !v)}
                  className="hover:opacity-80"
                >
                  <VolumeIcon level={muted ? 0 : volume} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setVolume(v);
                    setMuted(v === 0);
                  }}
                  className="video-seek h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/25 opacity-0 transition-all duration-200 group-hover:w-20 group-hover:opacity-100 sm:w-16 sm:opacity-100"
                  style={{
                    backgroundImage: `linear-gradient(to right, #fff ${
                      (muted ? 0 : volume) * 100
                    }%, rgba(255,255,255,0.25) 0%)`,
                  }}
                />
              </div>

              <span className="text-xs tabular-nums text-white/90 sm:text-sm">
                {formatTime(seekPreview ?? played)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-3 sm:gap-4">
              <button
                type="button"
                aria-label="Picture in picture"
                onClick={togglePip}
                className="hover:opacity-80"
              >
                <PipIcon />
              </button>
              <button
                type="button"
                aria-label={
                  isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"
                }
                onClick={toggleFullscreen}
                className="hover:opacity-80"
              >
                {isFullscreen ? (
                  <FullscreenExitIcon />
                ) : (
                  <FullscreenEnterIcon />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
