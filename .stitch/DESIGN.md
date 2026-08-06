# Design System: XoPhim (AniWatch-inspired dark streaming UI)

> Source of truth for prompting **Stitch** to generate XoPhim screens. Visual language cloned from AniWatch / HiAnime (https://aniwatch.biz.pl) — a dense, dark, poster-forward anime-streaming layout — but adapted for a Vietnamese **movie** site powered by the KKPhim API.
>
> **Audience & language:** XoPhim is a **Vietnamese movie-streaming site for a Vietnamese audience**. **ALL on-screen text must be in Vietnamese** — nav, section headings, buttons, labels, badges, placeholders, empty states, footer. Never generate English UI copy. Use the Vietnamese strings listed in §7. Content and taste skew to what Vietnamese viewers watch (Vietsub / Thuyết Minh / Lồng Tiếng phim bộ & phim lẻ, phim Hàn / Trung / Việt / US-UK).
>
> **Brand:** the project/product name is **XoPhim** — render the logo per §8 in every header and the footer.
>
> **Signature deviation from AniWatch:** clicking a movie card goes **straight to the watch/player screen** (instant play), NOT a separate detail page. Metadata (synopsis, cast, episode list) lives alongside the player on the watch screen.

---

## 1. Visual Theme & Atmosphere

Dark, dense, and content-saturated — a "wall of posters" feel where artwork carries the color and the chrome stays quiet. The mood is **cinematic, energetic, nocturnal**: near-black charcoal canvas, muted indigo-violet surfaces, and a single warm **golden** accent that makes calls-to-action and rankings pop. High information density (many rails and grids stacked vertically), tight gutters, minimal decorative whitespace. Flat overall with only whisper-soft elevation — depth comes from surface color steps (charcoal → indigo → lighter indigo), not heavy shadows. Pastel per-genre tags add playful spots of color against the dark field.

Adjectives: **Nocturnal, Dense, Poster-forward, Energetic, Utilitarian-but-warm.**

---

## 2. Color Palette & Roles

### Surfaces (dark, stepped for elevation)
- **Charcoal Canvas (#242428)** — app background / base layer behind all content.
- **Deep Indigo Chrome (#2D2B44)** — top navigation bar, sidebar, and primary raised panels (spotlight meta box, section headers).
- **Elevated Indigo (#3A3951)** — cards on hover, secondary buttons, dropdowns, input fields, filter chips.
- **Muted Slate (#515064 @ 60%)** — hairline borders, dividers, inactive chip fills.
- **Chip Indigo (#4E4E6D)** — pill-shaped menu items and category chips in their resting state.
- **True Black (#111111)** — image overlays, gradient scrims over backdrops, and dark text placed ON light badges.

### Accent
- **Signature Gold (#FFDD95)** — THE brand accent. Primary CTA fill ("Watch Now" / "Xem Ngay"), rating stars, spotlight rank numbers ("#1 Spotlight"), active/hover nav highlights, focus rings. Always paired with **black (#111)** text for contrast.

### Text
- **Pure White (#FFFFFF)** — primary text, titles, active nav.
- **Soft Silver (#DDDDDD)** — secondary text, card subtitles, meta.
- **Muted Gray (#AAAAAA)** — tertiary text, timestamps, inactive labels, footer.

### Status / Badge accents (poster overlays)
- **Sub Green (#B0E3AF)** — "SUB" / Vietsub badge (dark #111 text).
- **Dub Pink (#E3B5CD)** — "DUB" / Thuyết Minh badge (dark #111 text).
- **Episode Glass (rgba(238,238,238,0.2))** — translucent episode-count badge.

### Genre-tag pastels (rotating, one hue per genre)
Lime **#D0E6A5**, Gold **#FFDD95**, Coral **#FC887B**, Lavender **#CCABDA**, Sky **#ABCCD8**, Clay **#D8B2AB**, Mint **#86E3CE**. Rendered as text-only or faint-fill tags; cycle by genre index.

---

## 3. Typography Rules

- **Family:** `Poppins` (fallback `Arial`, sans-serif) across the entire UI — geometric, friendly, modern.
- **Section headings** ("Trending", "Phim Mới Cập Nhật"): weight **600 (SemiBold)**, ~20–24px, white, tight letter-spacing.
- **Card / movie titles:** weight **500 (Medium)**, ~14–15px, white; truncate to 1–2 lines with ellipsis.
- **Spotlight hero title:** weight **600–700**, large (36–56px), white.
- **Body / synopsis / meta:** weight **400 (Regular)**, ~13–14px, Soft Silver / Muted Gray.
- **Badges, ranks, tags:** weight **500–600**, small (11–12px), often uppercase.
- Letter-spacing is neutral-to-slightly-tight; no wide tracking. Line-height compact to support density.
- **Vietnamese diacritics:** all copy is Vietnamese, so glyphs must render marks cleanly (ẫ, ợ, ằ, ễ…). Poppins covers Latin-Extended and handles these well — keep it. Never substitute a font lacking full Vietnamese support.

---

## 4. Component Stylings

- **Primary Button ("Watch Now" / "Xem Ngay"):** Pill-shaped (border-radius 30px / fully rounded). Solid **Gold #FFDD95** fill, **black #111** text, matching gold border. Play-triangle icon leading. Subtle brighten on hover.
- **Secondary Button ("Detail" / "Thông tin"):** Same pill shape. Fill **Elevated Indigo #3A3951**, white text, no visible border. Hover lightens fill.
- **Nav / Menu pills (sidebar, categories):** Pill (radius ~20px), resting fill **Chip Indigo #4E4E6D** or transparent; active state uses **Gold** text or a gold underline.
- **Movie Cards / Posters:** **Sharp, squared-off corners (radius 0)** — posters are edge-to-edge rectangles, the defining AniWatch trait. 2:3 poster aspect. Overlaid at bottom-left: SUB (green) + DUB (pink) + episode badges. Title sits BELOW the poster in white 500. On hover: gentle scale-up (~1.03), a **Gold circular play button** fades in centered, and a dark scrim lifts the badges. **Whole card is one click target → navigates directly to the watch/player screen (instant play).**
- **Spotlight / Hero:** Full-bleed backdrop artwork with a **left-to-right black gradient scrim (#111 → transparent)** for text legibility. Overlaid: gold "#N Spotlight" kicker, large title, a row of meta chips (type · duration · release date · quality · SUB/DUB counts), 2-line synopsis, then Watch Now (gold) + Detail (indigo) buttons. Auto-rotating carousel with dot indicators.
- **Cards/Containers (panels):** Background **Deep Indigo #2D2B44**; near-flat with only a whisper-soft shadow or none; separated by color step rather than heavy elevation. Slightly rounded (~6–8px) for panels vs. sharp posters.
- **Inputs / Search:** Fill **Elevated Indigo #3A3951**, no hard stroke (or 1px Muted Slate), rounded ~6px, Muted Gray placeholder, white typed text, gold focus ring. Search is prominent in the top nav.
- **Badges/Ticks:** Small, near-square (radius ~2px), solid pastel fill with dark text — **"P.Đề"** (Vietsub) on green, **"T.Minh"** (Thuyết Minh) on pink, or glass fill for episode count (e.g. "Tập 12"). Keep badge labels Vietnamese and short.
- **Rank lists (Trending / Top 10):** Large faint outline numeral (01–10) beside a small poster + title + SUB/DUB ticks; the #1–3 numerals tinted **Gold**.
- **Auth Card:** A centered card on **Deep Indigo #2D2B44** over the dark canvas (or a dimmed backdrop-blur modal), rounded ~10px, max-width ~400px. Contains the XoPhim logo, heading, stacked inputs, a gold **"Đăng Nhập"** primary pill, an "hoặc" divider (thin Muted Slate line with centered label), then the Google SSO button, and a footer link to switch between Đăng Nhập / Đăng Ký.
- **Google SSO Button:** Full-width pill matching input width. **White (#FFFFFF) fill, dark (#242428) text**, the multicolor Google "G" logo at the leading edge, label **"Tiếp tục với Google"**. This is the one deliberately light element — it must read as the standard Google identity button. Subtle gray hover.
- **Auth Inputs:** Full-width, fill **Elevated Indigo #3A3951**, rounded ~6px, Muted Gray placeholder, white text, **Gold focus ring**. Password field has a show/hide eye toggle (Muted Gray). Inline validation errors in a soft coral (#FC887B) below the field.
- **Rating / Score Badge (IMDb / TMDb):** Small pill on posters and the spotlight showing the external score (from KKPhim's `imdb.vote_average` / `tmdb.vote_average`). A leading star ★ in **Gold #FFDD95**, the number in white, on a translucent black (#111 @ 60%) glass fill; place top-right of the poster. Label "IMDb 8.4" / "TMDb 8.1" in the spotlight meta row.
- **Server Selector (upgraded):** On the Xem Phim screen, servers are grouped by language track — sections labeled **"Phụ Đề"**, **"Thuyết Minh"**, **"Lồng Tiếng"** — each holding named server pills (e.g. "Server #1", "Server #2"). Active server pill = **Gold #FFDD95** fill / black text; inactive = **Chip Indigo #4E4E6D**. A separate **Chất Lượng** dropdown (4K · FHD · HD) sits beside the player controls.
- **Watch-screen Action Bar:** A row of ghost/pill buttons under the player: **Yêu Thích** (heart), **Thêm Bộ Sưu Tập** (+), **Chia Sẻ** (share), **Báo Lỗi** (flag, opens a small report dialog), **Tắt Đèn** (theater-mode toggle that dims everything except the player behind a #111 @ 85% scrim). Resting = transparent with Muted Gray icon+label; hover = Elevated Indigo fill, white; active (favorited / lights-off) = Gold accent.
- **Comment Block:** Below the player. A composer (avatar + Elevated Indigo textarea, gold "Gửi" button) then a list of comments — avatar, username (white 500), timestamp (Muted Gray), body, and like/reply actions. Requires login; logged-out shows "Đăng nhập để bình luận". Flat, no cards — separated by hairline #515064 dividers.
- **User Star Rating:** A 5-star row (Gold filled / Muted Slate empty) with an average score + count beside it ("4.5 · 128 lượt"). Interactive on hover when logged in.
- **Collection / Chủ Đề Card:** A wide landscape banner card (16:9-ish, radius ~8px) with a curated title overlaid on artwork + a gold "Xem Bộ Sưu Tập" affordance — used on the Chủ Đề screen and as an occasional home rail. Distinct from the sharp 2:3 movie poster.

---

## 5. Layout Principles

- **Grid-dense, vertically stacked rails.** The home screen is a tall scroll of labeled sections, each a horizontal rail or responsive poster grid. Tight, consistent gutters (~12–16px); content maxes to a centered container with slim side margins.
- **Poster grid:** responsive 6–7 columns on desktop → 2–3 on mobile, uniform 2:3 posters, title beneath. AniWatch-style density (small cards, many per row).
- **Right sidebar (desktop):** a sticky **Top 10** module with **Today / Week / Month** tabs; collapses below the main content on mobile.
- **Top navigation bar (Deep Indigo #2D2B44):** **XoPhim** logo (gold-accented, see §8) · prominent search with placeholder "Tìm kiếm phim..." · Vietnamese nav links ("Trang Chủ", "Phim Lẻ", "Phim Bộ", "Hoạt Hình", "TV Shows", "Phổ Biến", "Thể Loại") · hamburger opening a left slide-in sidebar with the full genre color-list.
- **Footer:** an **A–Z / 0-9 filter strip** of pills, plus link columns and disclaimer, on Charcoal Canvas.
- **Depth strategy:** layering communicated through the 3-step surface ramp (Charcoal → Deep Indigo → Elevated Indigo) plus gradient scrims over artwork — deliberately flat, minimal drop shadows.
- **Whitespace:** economical. Prioritize showing more content over breathing room, matching the AniWatch "everything above the fold" feel.

---

## 6. Screen Inventory (for Stitch generation)

Generate these screens; all share the palette, Poppins type, sharp posters, gold accent, and dark stepped surfaces above.

1. **Trang Chủ (Home)** — top nav + auto-rotating Spotlight carousel + genre color-chip row + rails: "Nổi Bật" (trending, ranked), "Phim Mới Cập Nhật" (latest), "Phim Bộ", "Phim Lẻ", "Hoạt Hình" (poster grids) + right **Top 10** sidebar with tabs "Hôm Nay / Tuần / Tháng" + A–Z footer.
2. **Xem Phim (Watch / Player)** — the instant-play target. Large HLS video player top with **Chất Lượng** dropdown + **Tắt Đèn** theater mode; below/beside it: title + meta chips + **IMDb/TMDb score**, the **Watch-screen Action Bar** (Yêu Thích · Thêm Bộ Sưu Tập · Chia Sẻ · Báo Lỗi), the upgraded **Server Selector** grouped by Phụ Đề / Thuyết Minh / Lồng Tiếng, episode list grid (phim bộ), synopsis, cast, **User Star Rating**, a **Comment Block**, and a "Phim Tương Tự" poster rail. Replaces AniWatch's separate detail page.
3. **Duyệt / Lọc Phim (Browse / Filter)** — poster grid with a filter bar (Thể Loại, Quốc Gia, Năm, Loại, Sắp Xếp) using indigo chips + gold active state, and pagination.
4. **Kết Quả Tìm Kiếm (Search Results)** — same grid as Browse, keyword echoed in a heading ("Kết quả cho: …"), instant-search dropdown from the nav.
5. **Đăng Nhập (Login)** — centered Auth Card: XoPhim logo, heading "Đăng Nhập", inputs Tên đăng nhập / Mật khẩu, "Ghi nhớ đăng nhập" checkbox + "Quên mật khẩu?" link, gold "Đăng Nhập" pill, "hoặc" divider, **"Tiếp tục với Google"** SSO button, footer "Chưa có tài khoản? Đăng ký".
6. **Đăng Ký (Register)** — same Auth Card layout: heading "Đăng Ký", inputs Tên đăng nhập / Email / Mật khẩu / Nhập lại mật khẩu, gold "Đăng Ký" pill, "hoặc" divider, "Tiếp tục với Google" SSO button, footer "Đã có tài khoản? Đăng nhập".
7. **Danh Sách Của Tôi (Watchlist)** — poster grid of saved movies (requires login), empty state "Bạn chưa lưu phim nào".
8. **Lịch Sử Xem / Xem Tiếp (History & Continue Watching)** — rail/grid of in-progress titles with a gold progress bar across each poster bottom + "Xem Tiếp" affordance; plus a full watch-history list. Also surfaced as the first rail on Trang Chủ when logged in.
9. **Chủ Đề / Bộ Sưu Tập (Collections)** — grid of landscape Collection Cards (curated lists e.g. "Marvel Vũ Trụ Điện Ảnh", "Phim Chiếu Rạp 2024"); opening one shows a themed poster grid. Editorial curation (own list of KKPhim slugs).
10. **Xem Chung (Watch Party)** — *Tier 3, realtime.* A room screen: the HLS player synced across members on the left, a live **chat panel** on the right (avatar + message list + composer), a members list, and a shareable room link / "Mời Bạn Bè" button. Host controls play/pause/seek for everyone. Needs a WebSocket backend — flag as a later build.

**When prompting Stitch:** describe screens with the Visual Descriptions above (e.g. "sharp-cornered 2:3 poster cards on a #242428 charcoal canvas, gold #FFDD95 pill 'Xem Ngay' button, Poppins SemiBold Vietnamese section headers, green 'P.Đề' / pink 'T.Minh' badges overlaid bottom-left"). Emphasize Vietnamese-only copy and that a poster click leads directly to the Xem Phim screen.

---

## 7. Vietnamese UI Copy (use verbatim)

All labels in Vietnamese. Canonical strings:

- **Nav:** Trang Chủ · Phim Lẻ · Phim Bộ · Hoạt Hình · TV Shows · Phổ Biến · Thể Loại
- **Buttons:** Xem Ngay (primary) · Thông Tin (secondary) · Tập Tiếp (next episode) · Xem Sau (watchlist) · Xem Tiếp (continue watching)
- **Section headings:** Nổi Bật · Phim Mới Cập Nhật · Phim Bộ Mới · Phim Lẻ Mới · Hoạt Hình · Sắp Chiếu · Phim Tương Tự · Top 10
- **Top-10 tabs:** Hôm Nay · Tuần · Tháng
- **Filters:** Thể Loại · Quốc Gia · Năm · Loại Phim · Sắp Xếp · Lọc · Xóa Lọc
- **Badges/meta:** P.Đề (Vietsub) · T.Minh (Thuyết Minh) · L.Tiếng (Lồng Tiếng) · Tập {n} · Hoàn Tất · Chất Lượng
- **Search:** placeholder "Tìm kiếm phim...", results "Kết quả cho: {từ khóa}"
- **States:** "Đang tải..." (loading) · "Không tìm thấy phim nào" (empty) · "Đã có lỗi xảy ra" (error)
- **Footer:** "XoPhim - Xem phim online miễn phí, chất lượng cao, cập nhật nhanh." plus columns Thể Loại / Quốc Gia / Liên Hệ.
- **Auth:** Đăng Nhập · Đăng Ký · Đăng Xuất · Tên đăng nhập · Email · Mật khẩu · Nhập lại mật khẩu · Ghi nhớ đăng nhập · Quên mật khẩu? · "Tiếp tục với Google" · "hoặc" (divider) · "Chưa có tài khoản? Đăng ký" · "Đã có tài khoản? Đăng nhập" · "Danh Sách Của Tôi" · "Lịch Sử Xem" · "Xem Tiếp" · empty "Bạn chưa lưu phim nào" / "Chưa có lịch sử xem".
- **Account menu (nav, when logged in):** avatar → dropdown: Danh Sách Của Tôi · Lịch Sử Xem · Hồ Sơ · Đăng Xuất.
- **Watch actions:** Yêu Thích · Thêm Bộ Sưu Tập · Chia Sẻ · Báo Lỗi · Tắt Đèn · Bật Đèn · Chất Lượng · Chọn Server · Phụ Đề · Thuyết Minh · Lồng Tiếng · Tập Tiếp · Tự Động Chuyển Tập.
- **Ratings/Comments:** "Đánh giá của bạn" · "{x} · {n} lượt" · Bình Luận · placeholder "Viết bình luận..." · Gửi · Trả lời · Thích · "Đăng nhập để bình luận" · "Hãy là người đầu tiên bình luận".
- **Collections:** Chủ Đề · Bộ Sưu Tập · Xem Bộ Sưu Tập.
- **Watch party:** Xem Chung · Tạo Phòng · Mời Bạn Bè · "Nhập tin nhắn..." · Thành Viên · Rời Phòng.
- **Report dialog:** "Báo lỗi phim" · options "Không phát được" / "Sai phim" / "Lỗi phụ đề" / "Giật/lag" · Gửi Báo Lỗi.

---

## 8. Brand & Logo — "XoPhim"

**Wordmark, not an icon-only mark.** Single word **"XoPhim"** set in **Poppins**, weight **700 (Bold)**, tight tracking, rendered as two color parts on one baseline:

- **"Xo"** in **Signature Gold (#FFDD95)**
- **"Phim"** in **Pure White (#FFFFFF)**

(On light/gold backgrounds, invert "Phim" to charcoal #242428.) No space between the parts — reads as one lockup "XoPhim". The name plays on Vietnamese *"phim"* = movie, so keep "Phim" legible and unmodified.

- **Optional glyph:** a small **gold play-triangle (▶) inside a rounded square** may sit immediately left of the wordmark as an app/favicon mark; keep it flat, single-color gold on charcoal.
- **Placement:** top-left of the nav bar (~24–28px cap height) and centered/left in the footer. Clickable → Trang Chủ.
- **Clear space:** at least the height of the "X" on all sides. Do not add gradients, drop shadows, outlines, or extra taglines inside the lockup.
- **Favicon / app icon:** the gold play-triangle-in-rounded-square on a charcoal #242428 field.

Example description for Stitch: *"Logo 'XoPhim' as a bold Poppins wordmark — 'Xo' in gold #FFDD95, 'Phim' in white — with a small gold play-triangle square to its left, on the dark indigo nav bar, top-left."*
