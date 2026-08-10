// Track classification from a KKPhim server name.
export function trackOf(serverName: string): "sub" | "dub" | "long" {
  const s = serverName.toLowerCase();
  if (s.includes("thuyết minh") || s.includes("t.minh")) return "dub";
  if (s.includes("lồng tiếng") || s.includes("l.tiếng")) return "long";
  return "sub";
}

export const TRACK_LABEL: Record<"sub" | "dub" | "long", string> = {
  sub: "Phụ Đề",
  dub: "Thuyết Minh",
  long: "Lồng Tiếng",
};

export const TRACK_TEXT: Record<"sub" | "dub" | "long", string> = {
  sub: "text-sub",
  dub: "text-dub",
  long: "text-silver",
};

export const WATCH_PREF_KEYS = {
  theater: "xophim.watch.theater",
  autoPlay: "xophim.watch.autoPlay",
  autoNext: "xophim.watch.autoNext",
  skipIntro: "xophim.watch.skipIntro",
} as const;

// "1" → "Tập 1"; leave non-numeric names ("Full", "OVA") as-is.
export function epLabel(name: string): string {
  return /^\d+$/.test(name.trim()) ? `Tập ${name.trim()}` : name;
}
