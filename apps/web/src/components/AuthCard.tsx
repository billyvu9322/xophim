import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

interface AuthCardProps {
  heading: string;
  children: ReactNode;
  /** Background image (from /public). Defaults to the shared poster-wall. */
  bgImage?: string;
  className?: string;
}

// Centered auth card over the Stitch cinematic movie-poster-wall backdrop
// (real image in /public), softly blurred + dimmed so the card stays readable.
export function AuthCard({ heading, children, bgImage = "/auth-bg-login.jpg", className }: AuthCardProps) {
  return (
    <div className="relative flex min-h-[calc(100vh-8rem)] items-center justify-center overflow-hidden bg-canvas px-4 py-10">
      {/* backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <img src={bgImage} alt="" className="h-full w-full scale-105 object-cover blur-sm" />
        <div className="absolute inset-0 bg-canvas/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/45 to-canvas/70" />
      </div>

      <div
        className={cn(
          "relative z-10 w-full max-w-[400px] space-y-5 rounded-[10px] bg-chrome/95 p-8 shadow-2xl ring-1 ring-white/10 backdrop-blur-sm",
          className,
        )}
      >
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="text-center text-2xl font-bold text-white">{heading}</h1>
        {children}
      </div>
    </div>
  );
}
