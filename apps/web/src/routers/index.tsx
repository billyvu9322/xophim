import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootLayout } from "../pages/root";
import { HomePage } from "../pages/home";
import { BrowsePage } from "../pages/browse";
import { SearchPage } from "../pages/search";
import { WatchPage } from "../pages/watch";
import { LoginPage } from "../pages/login";
import { RegisterPage } from "../pages/register";
import { WatchlistPage } from "../pages/watchlist";
import { HistoryPage } from "../pages/history";
import { CollectionsPage } from "../pages/collections";
import { CollectionDetailPage } from "../pages/collection-detail";
import { RoomPage } from "../pages/room";

const rootRoute = createRootRoute({ component: RootLayout });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const browseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/list/$type",
  component: BrowsePage,
});

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  validateSearch: (s: Record<string, unknown>) => ({
    keyword: (s.keyword as string) ?? "",
  }),
  component: SearchPage,
});

const watchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/xem/$slug",
  // Episode (tap) + server (sv) live in the URL so a reload keeps the current
  // episode instead of snapping back to the first one. Optional so plain
  // <Link to="/xem/$slug"> (no episode known yet) stays valid.
  validateSearch: (
    s: Record<string, unknown>,
  ): { tap?: string; sv?: number } => ({
    tap: typeof s.tap === "string" && s.tap ? s.tap : undefined,
    sv: s.sv != null ? Number(s.sv) || 0 : undefined,
  }),
  component: WatchPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dang-nhap",
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dang-ky",
  component: RegisterPage,
});

const watchlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/danh-sach",
  component: WatchlistPage,
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lich-su",
  component: HistoryPage,
});

const collectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chu-de",
  component: CollectionsPage,
});

const collectionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chu-de/$slug",
  component: CollectionDetailPage,
});

const roomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/xem-chung/$code",
  component: RoomPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  browseRoute,
  searchRoute,
  watchRoute,
  loginRoute,
  registerRoute,
  watchlistRoute,
  historyRoute,
  collectionsRoute,
  collectionDetailRoute,
  roomRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
