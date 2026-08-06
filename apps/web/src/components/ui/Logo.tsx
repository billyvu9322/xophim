import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

// XoPhim wordmark (DESIGN.md §8): "Xo" gold + "Phim" white, bold Poppins,
// with a small gold play-triangle-in-rounded-square glyph to its left.
export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("flex items-center gap-2 select-none", className)}>
      <span className="grid h-8 w-8 place-items-center rounded-md bg-gold text-canvas">
        <Play className="h-4 w-4 fill-canvas" />
      </span>
      <span className="text-2xl font-bold tracking-tight leading-none">
        <span className="text-gold">Xo</span>
        <span className="text-white">Phim</span>
      </span>
    </Link>
  );
}
