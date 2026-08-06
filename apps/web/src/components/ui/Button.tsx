import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Pill buttons per DESIGN.md §4. Primary = gold fill / black text ("Xem Ngay");
// secondary = elevated indigo; ghost = transparent action-bar buttons.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold",
  {
    variants: {
      variant: {
        primary: "bg-gold text-[#111111] hover:brightness-105",
        secondary: "bg-elevated text-white hover:bg-chip",
        ghost: "bg-transparent text-muted hover:bg-elevated hover:text-white",
        outline: "border border-slate text-white hover:bg-elevated",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-7 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
