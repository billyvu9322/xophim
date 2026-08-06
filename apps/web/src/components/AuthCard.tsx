import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

interface AuthCardProps {
  heading: string;
  children: ReactNode;
  className?: string;
}

export function AuthCard({ heading, children, className }: AuthCardProps) {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-10">
      <div
        className={cn(
          "max-w-[400px] w-full bg-chrome rounded-[10px] p-8 space-y-5",
          className,
        )}
      >
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="text-2xl font-bold text-white text-center">{heading}</h1>
        {children}
      </div>
    </div>
  );
}
