import { GoogleOAuthProvider } from "@react-oauth/google";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";

import { router } from "./routers";
import "./index.css";

const queryClient = new QueryClient();
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster theme="dark" position="top-right" />
      </QueryClientProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
);

// Dismiss the boot splash (index.html) once React has mounted. A short minimum
// keeps it from flickering on fast loads; skeletons then handle per-page loading.
const splash = document.getElementById("app-splash");
if (splash) {
  window.setTimeout(() => {
    splash.classList.add("app-splash--hidden");
    splash.addEventListener("transitionend", () => splash.remove(), {
      once: true,
    });
  }, 600);
}
