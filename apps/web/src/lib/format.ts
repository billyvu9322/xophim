import type { Movie } from "./catalog-types";
import type { MovieSnapshot } from "./user-state-types";

// Map a catalog Movie to the compact snapshot the user-state API stores
// alongside watchlist / progress rows (name, poster, type, year).
export function toSnapshot(movie: Pick<Movie, "name" | "posterUrl" | "type" | "year">): MovieSnapshot {
  return {
    name: movie.name,
    posterUrl: movie.posterUrl,
    type: movie.type,
    year: movie.year,
  };
}

// Parse a KKPhim `lang` string ("Vietsub", "Vietsub + Thuyết Minh", "Lồng Tiếng")
// into the short Vietnamese track badges used on posters (§7).
export interface LangBadge {
  label: string;
  kind: "sub" | "dub";
}
export function langBadges(lang: string): LangBadge[] {
  const l = (lang ?? "").toLowerCase();
  const out: LangBadge[] = [];
  if (l.includes("vietsub") || l.includes("phụ đề") || l.includes("p.đề")) {
    out.push({ label: "P.Đề", kind: "sub" });
  }
  if (l.includes("thuyết minh") || l.includes("t.minh")) {
    out.push({ label: "T.Minh", kind: "dub" });
  }
  if (l.includes("lồng tiếng") || l.includes("l.tiếng")) {
    out.push({ label: "L.Tiếng", kind: "dub" });
  }
  if (out.length === 0 && lang) out.push({ label: "P.Đề", kind: "sub" });
  return out;
}

// Strip all HTML tags from a third-party string (KKPhim synopsis) and decode a
// few common entities — rendered as plain text to avoid any XSS surface.
export function stripHtml(html: string): string {
  const text = (html ?? "").replace(/<[^>]*>/g, " ");
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Seconds → "mm:ss" or "h:mm:ss".
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// ISO datetime → "x phút/giờ/ngày trước" (Vietnamese relative time).
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "vừa xong";
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} ngày trước`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon} tháng trước`;
  return `${Math.floor(mon / 12)} năm trước`;
}
