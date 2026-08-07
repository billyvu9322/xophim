import { Clapperboard } from "lucide-react";
import { useState } from "react";
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
  const showFallback = errored || !src;

  if (showFallback) {
    const text = label ?? alt;
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-chrome via-elevated to-chrome p-2 text-center">
        <Clapperboard className={cn("text-gold/40", compact ? "h-4 w-4" : "h-8 w-8")} />
        {!compact && text && (
          <span className="line-clamp-2 px-1 text-xs font-medium text-muted">{text}</span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className={imgClassName ?? "h-full w-full object-cover"}
    />
  );
}
