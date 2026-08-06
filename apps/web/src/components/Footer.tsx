import { Link } from "@tanstack/react-router";
import { Logo } from "./ui/Logo";

const AZ = ["A", "B", "C", "D", "E", "G", "H", "K", "L", "M", "N", "P", "Q", "R", "S", "T", "V", "X", "Y", "0-9"];

// Charcoal footer with an A–Z filter strip + link columns + disclaimer (§5).
export function Footer() {
  return (
    <footer className="mt-12 border-t border-slate/40 bg-canvas">
      <div className="mx-auto max-w-[1600px] space-y-8 px-4 py-10">
        <div className="flex flex-wrap gap-1.5">
          {AZ.map((c) => (
            <Link
              key={c}
              to="/search"
              search={{ keyword: c }}
              className="grid h-8 w-8 place-items-center rounded bg-elevated text-xs text-silver hover:bg-gold hover:text-[#111]"
            >
              {c}
            </Link>
          ))}
        </div>

        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted">
              XoPhim - Xem phim online miễn phí, chất lượng cao, cập nhật nhanh.
            </p>
          </div>
          <FooterCol
            title="Thể Loại"
            links={[
              { label: "Hành Động", to: "hanh-dong" },
              { label: "Tình Cảm", to: "tinh-cam" },
              { label: "Hài Hước", to: "hai-huoc" },
              { label: "Cổ Trang", to: "co-trang" },
            ]}
          />
          <FooterCol
            title="Quốc Gia"
            links={[
              { label: "Việt Nam", to: "viet-nam" },
              { label: "Hàn Quốc", to: "han-quoc" },
              { label: "Trung Quốc", to: "trung-quoc" },
              { label: "Âu Mỹ", to: "au-my" },
            ]}
          />
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white">Liên Hệ</h3>
            <p className="text-sm text-muted">Email: support@xophim.vn</p>
            <p className="text-sm text-muted">
              Nội dung phim từ nguồn bên thứ ba. XoPhim không lưu trữ video.
            </p>
          </div>
        </div>

        <p className="border-t border-slate/30 pt-6 text-xs text-muted">
          © {new Date().getFullYear()} XoPhim. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; to: string }[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <ul className="space-y-1.5">
        {links.map((l) => (
          <li key={l.to}>
            <Link
              to="/search"
              search={{ keyword: l.label }}
              className="text-sm text-muted hover:text-gold"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
