/// <reference types="vite/client" />

// Swiper ships CSS entry points without type declarations; these are side-effect
// CSS imports handled by Vite at build time. Declare them so TS stops erroring
// (TS2882) on `import "swiper/css"` and friends.
declare module "swiper/css";
declare module "swiper/css/*";
