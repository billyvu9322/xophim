import ReactPlayer from "react-player/lazy";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

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

// Movie player wrapper over react-player. Keeps the old imperative API for
// watch-party sync while enabling native HLS controls, PiP, fullscreen, and
// keyboard shortcuts through one player surface.
export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  { src, poster, autoPlay = true, startAt = 0, onTimeUpdate, onEnded, onPlay, onPause, onSeeked, className },
  ref,
) {
  const playerRef = useRef<ReactPlayer>(null);
  const durationRef = useRef(0);
  const didApplyStartRef = useRef(false);
  const [playing, setPlaying] = useState(autoPlay);

  useEffect(() => {
    didApplyStartRef.current = false;
    setPlaying(autoPlay);
  }, [autoPlay, src]);

  useImperativeHandle(ref, () => ({
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    seek: (sec: number) => {
      playerRef.current?.seekTo(sec, "seconds");
    },
    currentTime: () => playerRef.current?.getCurrentTime() ?? 0,
  }));

  const seekRelative = (deltaSec: number) => {
    const current = playerRef.current?.getCurrentTime() ?? 0;
    const duration = durationRef.current || Number.POSITIVE_INFINITY;
    const next = Math.max(0, Math.min(duration, current + deltaSec));
    playerRef.current?.seekTo(next, "seconds");
    onSeeked?.(next);
  };

  return (
    <div
      className={className ?? "h-full w-full bg-black"}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          seekRelative(-10);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          seekRelative(10);
        }
        if (event.key === " " || event.key === "k") {
          event.preventDefault();
          setPlaying((value) => !value);
        }
      }}
    >
      <ReactPlayer
        ref={playerRef}
        url={src}
        width="100%"
        height="100%"
        controls
        pip
        playsinline
        playing={playing}
        config={{
          file: {
            // Do NOT force hls.js: iOS Safari plays HLS natively but has no MSE
            // for video, so forcing hls.js breaks playback there. react-player
            // already falls back to hls.js on browsers without native HLS
            // (Chrome/Firefox/Android), so leaving this off works everywhere.
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
          if (!didApplyStartRef.current && startAt > 0) {
            playerRef.current?.seekTo(startAt, "seconds");
            didApplyStartRef.current = true;
          }
        }}
        onDuration={(duration) => {
          durationRef.current = duration;
        }}
        onProgress={({ playedSeconds }) => {
          const duration = durationRef.current;
          if (onTimeUpdate && duration > 0) onTimeUpdate(playedSeconds, duration);
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
    </div>
  );
});
