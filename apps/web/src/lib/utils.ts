import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn convention: merge conditional class lists with Tailwind conflict resolution.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
