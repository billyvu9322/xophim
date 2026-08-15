import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  LogOut,
  Menu,
  Search,
  User as UserIcon,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./ui/Logo";
import { useAuth, useLogout } from "@/hooks/auth";
import { useSearch as useCatalogSearch } from "@/hooks/catalog";
import type { Movie } from "@/apis/types/catalog-types";
import { DotLoading } from "./ui/DotLoading";

// Explicit Links (not a mapped array) so TanStack Router's typed `to`/`params`
// stay statically checked. `linkClass` styles the active state via [&.active].
const linkClass =
  "rounded-pill px-3 py-1.5 text-sm text-silver transition-colors hover:text-gold [&.active]:text-gold";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <Link
        to="/"
        activeOptions={{ exact: true }}
        className={linkClass}
        onClick={onNavigate}
      >
        Trang Chủ
      </Link>
      <Link
        to="/list/$type"
        params={{ type: "phim-le" }}
        className={linkClass}
        onClick={onNavigate}
      >
        Phim Lẻ
      </Link>
      <Link
        to="/list/$type"
        params={{ type: "phim-bo" }}
        className={linkClass}
        onClick={onNavigate}
      >
        Phim Bộ
      </Link>
      <Link
        to="/list/$type"
        params={{ type: "hoat-hinh" }}
        className={linkClass}
        onClick={onNavigate}
      >
        Hoạt Hình
      </Link>
      <Link
        to="/list/$type"
        params={{ type: "tv-shows" }}
        className={linkClass}
        onClick={onNavigate}
      >
        TV Shows
      </Link>
      <Link to="/chu-de" className={linkClass} onClick={onNavigate}>
        Chủ Đề
      </Link>
    </>
  );
}

export function Navbar() {
  const { data: user } = useAuth();
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (acctRef.current && !acctRef.current.contains(e.target as Node))
        setAcctOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-slate/40 bg-chrome/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4">
        <button
          className="lg:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>

        <Logo />

        <nav className="hidden items-center gap-1 lg:flex">
          <NavLinks />
        </nav>

        <div className="ml-auto hidden max-w-md flex-1 md:block">
          <SearchBox />
        </div>

        <div className="ml-auto md:ml-0" ref={acctRef}>
          {user ? (
            <div className="relative">
              <button
                onClick={() => setAcctOpen((v) => !v)}
                className="flex items-center gap-2 rounded-pill bg-elevated px-2.5 py-1.5 text-sm hover:bg-chip"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded-full bg-gold object-cover"
                  />
                ) : (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-gold text-[#111]">
                    <UserIcon className="h-4 w-4" />
                  </span>
                )}
                <span className="hidden max-w-[120px] truncate sm:inline">
                  {user.displayName || user.username || user.email}
                </span>
                <ChevronDown className="h-4 w-4 text-muted" />
              </button>
              {acctOpen && (
                <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-lg border border-slate/50 bg-chrome py-1 shadow-xl">
                  <Link
                    to="/tai-khoan"
                    onClick={() => setAcctOpen(false)}
                    className="block px-4 py-2 text-sm text-silver hover:bg-elevated hover:text-white"
                  >
                    Hồ Sơ
                  </Link>
                  <Link
                    to="/danh-sach"
                    onClick={() => setAcctOpen(false)}
                    className="block px-4 py-2 text-sm text-silver hover:bg-elevated hover:text-white"
                  >
                    Danh Sách Của Tôi
                  </Link>
                  <Link
                    to="/lich-su"
                    onClick={() => setAcctOpen(false)}
                    className="block px-4 py-2 text-sm text-silver hover:bg-elevated hover:text-white"
                  >
                    Lịch Sử Xem
                  </Link>
                  <button
                    onClick={() => {
                      setAcctOpen(false);
                      logout.mutate();
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-silver hover:bg-elevated hover:text-white"
                  >
                    <LogOut className="h-4 w-4" /> Đăng Xuất
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              to="/dang-nhap"
              className="rounded-pill bg-gold px-4 py-2 text-sm font-medium text-[#111] hover:brightness-105"
            >
              Đăng Nhập
            </Link>
          )}
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-slate/40 bg-chrome px-4 py-3 lg:hidden">
          <div className="mb-3 md:hidden">
            <SearchBox onNavigate={() => setMenuOpen(false)} />
          </div>
          <nav className="flex flex-col">
            <NavLinks onNavigate={() => setMenuOpen(false)} />
          </nav>
        </div>
      )}
    </header>
  );
}

function SearchBox({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLFormElement>(null);
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [open, setOpen] = useState(false);
  const trimmedKeyword = keyword.trim();
  const queryKeyword = debouncedKeyword.length >= 2 ? debouncedKeyword : "";
  const { data, isFetching, isError } = useCatalogSearch(queryKeyword, {
    page: 1,
    limit: 5,
  });
  const results = data?.items ?? [];

  useEffect(() => {
    const id = window.setTimeout(
      () => setDebouncedKeyword(trimmedKeyword),
      250,
    );
    return () => window.clearTimeout(id);
  }, [trimmedKeyword]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const goToSearch = () => {
    if (!trimmedKeyword) return;
    setOpen(false);
    onNavigate?.();
    void navigate({ to: "/search", search: { keyword: trimmedKeyword } });
  };

  const goToMovie = (movie: Movie) => {
    setOpen(false);
    setKeyword(movie.name);
    onNavigate?.();
    void navigate({ to: "/xem/$slug", params: { slug: movie.slug } });
  };

  const goToFilter = () => {
    setOpen(false);
    onNavigate?.();
    void navigate({
      to: "/filter",
      search: {
        type: "phim-moi",
        country: "",
        category: "",
        year: "",
        lang: "",
        sort: 0,
        page: 1,
      },
    });
  };

  const showDropdown = open && trimmedKeyword.length >= 2;

  return (
    <form
      ref={rootRef}
      onSubmit={(event) => {
        event.preventDefault();
        goToSearch();
      }}
      className="relative w-full"
    >
      {/* White pill holding the input, a search icon, then a dark "Filter"
          button — matches the reference design (aniwatch-style). */}
      <div className="flex h-11 items-center gap-2 rounded-lg bg-white pl-4 pr-2">
        <input
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Tìm kiếm phim..."
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-[#111] placeholder:text-[#6b7280] focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Tìm kiếm"
          className="shrink-0 text-[#111] hover:text-[#444]"
        >
          <Search className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={goToFilter}
          className="flex h-8 shrink-0 ml-1 items-center gap-1.5 rounded-md bg-[#111] px-4 text-sm font-medium text-white hover:bg-[#333]"
        >
          {/* <SlidersHorizontal className="h-4 w-4" /> */}
          Bộ lọc
        </button>
      </div>

      {showDropdown && (
        <div className="absolute -left-[15px] -right-[15px] top-[54px] z-50 bg-[#2d2b44] text-white shadow-[0_20px_20px_rgba(0,0,0,0.3)]">
          {isFetching && <DotLoading />}

          {!isFetching && isError && (
            <div className="px-[15px] py-5 text-center text-sm text-[#aaa]">
              Không thể tải kết quả.
            </div>
          )}

          {!isFetching && !isError && results.length === 0 && (
            <div className="px-[15px] py-5 text-center text-sm text-[#aaa]">
              Không tìm thấy phim.
            </div>
          )}

          {!isFetching && !isError && results.length > 0 && (
            <div>
              {results.map((movie) => (
                <button
                  key={movie.slug}
                  type="button"
                  onClick={() => goToMovie(movie)}
                  className="group relative flex w-full gap-[15px] p-[15px] text-left transition-colors hover:bg-white/5"
                >
                  <span className="relative h-[55px] w-10 shrink-0 overflow-hidden bg-white/10">
                    <img
                      src={movie.posterUrl || movie.thumbUrl}
                      alt={movie.name}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  </span>
                  <span className="min-w-0 flex-1 text-xs leading-6">
                    <span className="mb-1 block truncate text-sm font-medium leading-[16.8px] text-white group-hover:text-gold">
                      {movie.name}
                    </span>
                    {movie.originName && (
                      <span className="mb-1 block truncate text-[13px] leading-[15.6px] text-[#aaa]">
                        {movie.originName}
                      </span>
                    )}
                    <span className="block truncate text-xs leading-[15.6px] text-[#aaa]">
                      {[movie.year, movie.quality, movie.episodeCurrent]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={goToSearch}
                className="mx-[15px] mb-[15px] block w-[calc(100%-30px)] bg-gold p-[15px] text-center text-base font-medium leading-6 text-[#111] hover:brightness-105"
              >
                Xem tất cả kết quả
              </button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
