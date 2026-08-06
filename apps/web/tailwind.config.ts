import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// XoPhim design system — AniWatch-inspired dark streaming UI.
// Tokens mirror .stitch/DESIGN.md §2 (colors) and §3 (typography).
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces (stepped for elevation)
        canvas: "#242428", // app background
        chrome: "#2D2B44", // nav / panels
        elevated: "#3A3951", // hover cards, inputs, secondary buttons
        slate: "#515064", // borders / dividers
        chip: "#4E4E6D", // resting pill fill
        // Accent
        gold: "#FFDD95", // THE brand accent
        // Status
        sub: "#B0E3AF", // P.Đề (Vietsub)
        dub: "#E3B5CD", // T.Minh (Thuyết Minh)
        // Text
        silver: "#DDDDDD",
        muted: "#AAAAAA",
        // legacy brand kept for App.tsx placeholder
        brand: { DEFAULT: "#FFDD95", dark: "#e6c069" },
      },
      fontFamily: {
        sans: ["Poppins", "Arial", "sans-serif"],
      },
      borderRadius: {
        pill: "30px",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
