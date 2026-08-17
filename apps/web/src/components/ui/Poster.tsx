import { Clapperboard } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface PosterProps {
  src?: string | null;
  alt: string;
  /** Text shown on the fallback (defaults to alt). Pass "" to show icon only. */
  label?: string;
  /** Classes for the <img> (fallback fills the parent regardless). */
  imgClassName?: string;
  /** Smaller icon + no label — for tiny thumbnails (Top 10 rows). */
  compact?: boolean;
}

// <img> with a graceful fallback: on load error (or missing src) it swaps to an
// on-brand gradient tile with a film icon + title, so broken posters never show
// the browser's ugly default. Fills its parent (parent controls aspect/rounding).
export function Poster({ src, alt, label, imgClassName, compact }: PosterProps) {
  const [errored, setErrored] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const showFallback = errored || !src;

  useEffect(() => {
    setErrored(false);
    setIsVisible(false);
    setLoaded(false);
  }, [src]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !src) return;

    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsVisible(true);
        observer.disconnect();
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [src]);

  if (!showFallback && !isVisible) {
    return (
      <div ref={rootRef} className="h-full w-full bg-elevated" />
    );
  }

  if (showFallback) {
    const text = label ?? alt;
    return (
      <div
        ref={rootRef}
        className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-chrome via-elevated to-chrome p-2 text-center"
      >
        <Clapperboard className={cn("text-gold/40", compact ? "h-4 w-4" : "h-8 w-8")} />
        {!compact && text && (
          <span className="line-clamp-2 px-1 text-xs font-medium text-muted">{text}</span>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative h-full w-full">
      {/* Placeholder stays until the image finishes decoding, then the <img>
          fades in over it. Static, calm fill (no pulse) so there's no bright
          flicker, and a slow fade so the reveal is gentle on the eyes. */}
      {!loaded && <div className="absolute inset-0 bg-elevated" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={cn(
          imgClassName ?? "h-full w-full object-cover",
          "transition-opacity duration-[900ms] ease-out",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
