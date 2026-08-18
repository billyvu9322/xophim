import { useQuery } from "@tanstack/react-query";
import { Activity, Clock3, Eye, Film, RefreshCw, Users } from "lucide-react";
import { analysisApi } from "@/apis/analysis-api";
import type { AnalysisOverview } from "@/apis/types/analysis-types";
import { cn } from "@/lib/utils";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function StatCard({
  label,
  value,
  icon,
  tone = "gold",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "gold" | "green" | "blue" | "rose";
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
      <div
        className={cn(
          "absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl",
          tone === "gold" && "bg-gold/25",
          tone === "green" && "bg-emerald-400/25",
          tone === "blue" && "bg-sky-400/25",
          tone === "rose" && "bg-rose-400/25",
        )}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-300">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-white">{value}</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-black/30 text-gold ring-1 ring-white/10">
          {icon}
        </div>
      </div>
    </div>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-white/10", className)} />;
}

function DashboardSkeleton() {
  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#17171f] via-[#111116] to-black p-6 shadow-2xl shadow-black/30">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="w-full max-w-2xl space-y-4">
            <SkeletonBlock className="h-4 w-40 bg-gold/20" />
            <SkeletonBlock className="h-11 w-72 max-w-full" />
            <SkeletonBlock className="h-5 w-full max-w-xl" />
            <SkeletonBlock className="h-5 w-3/4 max-w-md" />
          </div>
          <SkeletonBlock className="h-11 w-28" />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="h-9 w-16" />
              </div>
              <SkeletonBlock className="h-11 w-11" />
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
          <SkeletonBlock className="h-7 w-48" />
          <div className="mt-5 space-y-4">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 border-b border-white/5 pb-3">
                <SkeletonBlock className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <SkeletonBlock className="h-4 w-44" />
                  <SkeletonBlock className="h-3 w-56 max-w-full" />
                </div>
                <SkeletonBlock className="hidden h-4 w-20 sm:block" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
          <SkeletonBlock className="h-7 w-44" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 rounded-xl bg-black/25 p-2 ring-1 ring-white/5">
                <SkeletonBlock className="h-4 w-6" />
                <SkeletonBlock className="h-14 w-10" />
                <div className="flex-1 space-y-2">
                  <SkeletonBlock className="h-4 w-40 max-w-full" />
                  <SkeletonBlock className="h-3 w-28" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
        <SkeletonBlock className="h-7 w-56" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex gap-3 rounded-xl bg-black/25 p-3 ring-1 ring-white/5">
              <SkeletonBlock className="h-20 w-14" />
              <div className="flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-44 max-w-full" />
                <SkeletonBlock className="h-3 w-36" />
                <SkeletonBlock className="h-3 w-48 max-w-full" />
                <SkeletonBlock className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Dashboard({ data, onRefresh, refreshing }: { data: AnalysisOverview; onRefresh: () => void; refreshing: boolean }) {
  const { summary } = data;
  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#17171f] via-[#111116] to-black p-6 shadow-2xl shadow-black/30">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-gold">XoPhim Ops</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">
              Dashboard Analysis
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
              Theo dõi user đã đăng nhập, session còn sống, phim được xem nhiều và lịch sử hoạt động gần nhất.
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Làm mới
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Tổng user" value={summary.totalUsers} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Session active" value={summary.activeSessions} icon={<Activity className="h-5 w-5" />} tone="green" />
        <StatCard label="User có lịch sử" value={summary.usersWithHistory} icon={<Eye className="h-5 w-5" />} tone="blue" />
        <StatCard label="Lượt xem lưu" value={summary.totalProgressRows} icon={<Clock3 className="h-5 w-5" />} tone="rose" />
        <StatCard label="Watchlist" value={summary.totalWatchlistRows} icon={<Film className="h-5 w-5" />} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
          <h2 className="text-xl font-bold text-white">Users đã tồn tại</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-400">
                <tr className="border-b border-white/10">
                  <th className="py-3">User</th>
                  <th>Role</th>
                  <th>Active</th>
                  <th>History</th>
                  <th>Watchlist</th>
                  <th>Last watch</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id} className="border-b border-white/5 text-slate-200">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-gold/20 text-sm font-black text-gold">
                          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : user.displayName.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-white">{user.displayName || user.username || user.email}</p>
                          <p className="text-xs text-slate-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>{user.role}</td>
                    <td>{user.activeSessions}</td>
                    <td>{user.watchProgressCount}</td>
                    <td>{user.watchlistCount}</td>
                    <td>{formatDate(user.lastWatchAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
          <h2 className="text-xl font-bold text-white">Top phim đang xem</h2>
          <div className="mt-4 space-y-3">
            {data.topMovies.map((movie, index) => (
              <div key={movie.movieSlug} className="flex items-center gap-3 rounded-xl bg-black/25 p-2 ring-1 ring-white/5">
                <span className="w-6 text-center text-sm font-black text-gold">{index + 1}</span>
                <img src={movie.posterUrl} alt="" className="h-14 w-10 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{movie.name}</p>
                  <p className="text-xs text-slate-400">{movie.watchers} users • {movie.progressRows} lượt</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
        <h2 className="text-xl font-bold text-white">Hoạt động xem gần đây</h2>
        <div className="mt-4 grid max-h-[min(640px,calc(100vh-10rem))] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
          {data.recentActivity.map((item) => (
            <div key={item.id} className="flex gap-3 rounded-xl bg-black/25 p-3 ring-1 ring-white/5">
              <img src={item.posterUrl} alt="" className="h-20 w-14 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{item.movieName}</p>
                <p className="text-xs text-slate-400">{item.email}</p>
                <p className="mt-2 text-xs text-slate-300">
                  {item.episodeSlug} • {formatDuration(item.positionSec)} / {item.durationSec ? formatDuration(item.durationSec) : "?"}
                </p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(item.updatedAt)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export function AnalysisPage() {
  const overview = useQuery({
    queryKey: ["analysis", "overview"],
    queryFn: () => analysisApi.overview(),
    retry: false,
  });

  if (overview.isError) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-danger/40 bg-danger/10 p-6 text-danger">
          Không có quyền truy cập dashboard. Hãy đăng nhập bằng tài khoản admin.
        </div>
      </main>
    );
  }

  if (overview.isLoading || !overview.data) {
    return <DashboardSkeleton />;
  }

  return <Dashboard data={overview.data} onRefresh={() => void overview.refetch()} refreshing={overview.isFetching} />;
}
