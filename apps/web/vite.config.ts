import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Dev: forward API calls to the Fastify server so the SPA can use a
      // relative /v1 base and avoid CORS entirely.
      "/v1": {
        target: "http://localhost:6001",
        changeOrigin: true,
      },
    },
  },
});
