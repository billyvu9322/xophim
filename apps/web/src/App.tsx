import { Film } from "lucide-react";

// Placeholder landing. Feature screens (Home, Movie detail, Search, Player)
// and the TanStack Router shell land here once the feature plan exists.
export function App() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <Film className="h-12 w-12 text-brand" />
      <h1 className="text-3xl font-bold">XoPhim</h1>
      <p className="max-w-md text-sm text-neutral-400">
        Codebase scaffold. Chưa có feature — sẵn sàng để lên plan và implement.
      </p>
    </div>
  );
}
