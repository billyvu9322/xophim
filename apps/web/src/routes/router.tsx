import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { RootLayout } from "./root";
import { HomePage } from "./home";
import { BrowsePage } from "./browse";
import { SearchPage } from "./search";
import { WatchPage } from "./watch";
import { LoginPage } from "./login";
import { RegisterPage } from "./register";
import { WatchlistPage } from "./watchlist";
import { HistoryPage } from "./history";
import { CollectionsPage } from "./collections";
import { CollectionDetailPage } from "./collection-detail";
import { RoomPage } from "./room";

const rootRoute = createRootRoute({ component: RootLayout });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });

const browseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/list/$type",
  component: BrowsePage,
});

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  validateSearch: (s: Record<string, unknown>) => ({ keyword: (s.keyword as string) ?? "" }),
  component: SearchPage,
});

const watchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/xem/$slug",
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
