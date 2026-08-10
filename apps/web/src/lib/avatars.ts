// Preset avatar list. Users pick one instead of uploading (no object storage in
// the deploy). Served by DiceBear (free, URL-based, no auth) using the cute
// illustrated "lorelei" style so every avatar has a soft anime-ish look.
const SEEDS = [
  "Sakura",
  "Hina",
  "Yuki",
  "Aoi",
  "Rin",
  "Mochi",
  "Nana",
  "Kaito",
  "Momo",
  "Sora",
  "Miko",
  "Hoshi",
  "Kira",
  "Luna",
  "Yuzu",
  "Ren",
  "Chibi",
  "Suki",
  "Tama",
  "Usagi",
];

export const PRESET_AVATARS: string[] = SEEDS.map(
  (seed) =>
    `https://api.dicebear.com/9.x/lorelei/svg?seed=${seed}&backgroundColor=ffdfbf,ffd5dc,d1d4f9,c0aede,b6e3f4`,
);
