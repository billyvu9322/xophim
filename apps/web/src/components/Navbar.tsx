import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, LogOut, Menu, Search, User as UserIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./ui/Logo";
import { useAuth, useLogout } from "@/hooks/auth";

// Explicit Links (not a mapped array) so TanStack Router's typed `to`/`params`
// stay statically checked. `linkClass` styles the active state via [&.active].
const linkClass =
  "rounded-pill px-3 py-1.5 text-sm text-silver transition-colors hover:text-gold [&.active]:text-gold";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <Link to="/" activeOptions={{ exact: true }} className={linkClass} onClick={onNavigate}>
        Trang Chủ
      </Link>
      <Link to="/list/$type" params={{ type: "phim-le" }} className={linkClass} onClick={onNavigate}>
        Phim Lẻ
      </Link>
      <Link to="/list/$type" params={{ type: "phim-bo" }} className={linkClass} onClick={onNavigate}>
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
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const kw = keyword.trim();
    if (kw) {
      setMenuOpen(false);
      void navigate({ to: "/search", search: { keyword: kw } });
    }
  };

  const searchBox = (
    <form onSubmit={submitSearch} className="w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Tìm kiếm phim..."
          className="h-9 w-full rounded-md bg-elevated pl-9 pr-3 text-sm text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-gold"
        />
      </div>
    </form>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate/40 bg-chrome/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4">
        <button className="lg:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>

        <Logo />

        <nav className="hidden items-center gap-1 lg:flex">
          <NavLinks />
        </nav>

        <div className="ml-auto hidden max-w-xs flex-1 md:block">{searchBox}</div>

        <div className="ml-auto md:ml-0" ref={acctRef}>
          {user ? (
            <div className="relative">
              <button
                onClick={() => setAcctOpen((v) => !v)}
                className="flex items-center gap-2 rounded-pill bg-elevated px-2.5 py-1.5 text-sm hover:bg-chip"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-gold text-[#111]">
                  <UserIcon className="h-4 w-4" />
                </span>
                <span className="hidden max-w-[120px] truncate sm:inline">
                  {user.username ?? user.email}
                </span>
                <ChevronDown className="h-4 w-4 text-muted" />
              </button>
              {acctOpen && (
                <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-lg border border-slate/50 bg-chrome py-1 shadow-xl">
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
          <div className="mb-3 md:hidden">{searchBox}</div>
          <nav className="flex flex-col">
            <NavLinks onNavigate={() => setMenuOpen(false)} />
          </nav>
        </div>
      )}
    </header>
  );
}
