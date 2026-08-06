import Hls from "hls.js";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

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

// HLS player. Uses hls.js where MSE is available, falls back to native HLS
// (Safari / iOS) via the plain <video src>. Cleans up the Hls instance on
// src change / unmount to avoid leaks.
export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  { src, poster, autoPlay = true, startAt = 0, onTimeUpdate, onEnded, onPlay, onPause, onSeeked, className },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useImperativeHandle(ref, () => ({
    play: () => void videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
    seek: (sec: number) => {
      if (videoRef.current) videoRef.current.currentTime = sec;
    },
    currentTime: () => videoRef.current?.currentTime ?? 0,
  }));

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let hls: Hls | null = null;

    const onLoaded = () => {
      if (startAt > 0) video.currentTime = startAt;
      if (autoPlay) void video.play().catch(() => {});
    };

    if (Hls.isSupported() && !src.includes(".mp4")) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, onLoaded);
    } else {
      video.src = src;
      video.addEventListener("loadedmetadata", onLoaded, { once: true });
    }

    return () => {
      if (hls) hls.destroy();
      video.removeAttribute("src");
    };
    // startAt/autoPlay intentionally excluded — only re-init on src change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      controls
      playsInline
      className={className ?? "h-full w-full bg-black"}
      onTimeUpdate={(e) => {
        const v = e.currentTarget;
        if (onTimeUpdate && v.duration) onTimeUpdate(v.currentTime, v.duration);
      }}
      onEnded={onEnded}
      onPlay={onPlay}
      onPause={onPause}
      onSeeked={(e) => onSeeked?.(e.currentTarget.currentTime)}
    />
  );
});
