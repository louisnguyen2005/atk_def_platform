# Điều chỉnh cấu hình hệ thống MekoDataCTF

Tài liệu này chỉ ra **chức năng nào được cấu hình ở đâu** trong toàn bộ workspace: website đăng ký + scoreboard, hệ thống chấm điểm ForcAD, lab Round 1, checker và sandbox CyberRange. Mỗi mục ghi rõ đường dẫn file, tên biến/hằng số, giá trị hiện tại và cách áp dụng thay đổi.

- Mọi đường dẫn tính từ thư mục gốc workspace: `D:\TAILIEU\LVTN\MEKOSHARING\`.
- Số dòng (nếu có) là vị trí tại thời điểm viết, có thể lệch khi code thay đổi — tìm theo tên hằng số/hàm cho chắc.
- Các file chứa mật khẩu, token, khóa SSH được đánh dấu 🔒: **không đưa lên Git, không chia sẻ cho đội thi**. Tài liệu này không chép giá trị bí mật nào.

---

## Mục lục

1. [Bảng tra nhanh](#1-bảng-tra-nhanh)
2. [Áp dụng thay đổi: khi nào cần khởi động lại / build lại](#2-áp-dụng-thay-đổi)
3. [Website MekoDataCTF](#3-website-mekodatactf-mekodatactf_website)
4. [ForcAD (chấm điểm)](#4-forcad-chấm-điểm-forcad-demo)
5. [Lab Round 1 (webservice có lỗ hổng)](#5-lab-round-1-round1-lab)
6. [Sandbox CyberRange và checker](#6-sandbox-cyberrange-và-checker)
7. [SSH vận hành (Pool 101)](#7-ssh-vận-hành-pool-101)
8. [Kịch bản thường gặp](#8-kịch-bản-thường-gặp)
9. [Những thứ chưa cấu hình được (phải sửa code)](#9-những-thứ-chưa-cấu-hình-được-phải-sửa-code)

---

## 1. Bảng tra nhanh

| Muốn chỉnh | Nơi chỉnh | Chi tiết |
|---|---|---|
| Mở/đóng đăng ký, hạn đăng ký | Website → `/admin/schedule` | [3.2](#32-trang-quản-trị-admin-không-cần-sửa-code) |
| Giờ bắt đầu/kết thúc thi (hiển thị, đếm ngược) | Website → `/admin/schedule` | [3.2](#32-trang-quản-trị-admin-không-cần-sửa-code) |
| Số thành viên tối thiểu mỗi đội | Website → `/admin/schedule` | [3.2](#32-trang-quản-trị-admin-không-cần-sửa-code) |
| Số thành viên **tối đa** mỗi đội (cố định 4) | `MekoDataCTF_Website/models/Setting.js` → `MAX_MEMBERS` | [3.3](#33-đăng-ký-đội-và-thành-viên) |
| Nội dung trang chủ (giới thiệu, thể lệ, giải thưởng, FAQ) | Website → `/admin/contents` | [3.2](#32-trang-quản-trị-admin-không-cần-sửa-code) |
| Token đội, cấp token mới, tên đội trên ForcAD | Website → `/admin/teams/<id>` | [3.4](#34-đăng-nhập-và-token-đội) |
| Đồng bộ token đội sang ForcAD | `npm run sync:forcad` | [3.4](#34-đăng-nhập-và-token-đội) |
| Tài khoản BTC website | `MekoDataCTF_Website/.env` + `npm run seed` | [3.1](#31-biến-môi-trường-env) |
| Địa chỉ ForcAD mà website đọc điểm/nộp flag | `MekoDataCTF_Website/.env` → `FORCAD_URL` | [3.1](#31-biến-môi-trường-env) |
| **Số lượng đội** | Nhiều tầng: ForcAD, sandbox, lab, checker, bản đồ | [8.1](#81-thay-đổi-số-lượng-đội) |
| Thời lượng tick, số tick Round 1 | `ForcAD-demo/backend/lib/storage/round1.py` | [4.4](#44-round-1-3-task-ctf-attackdefense) |
| Luật điểm Attack/Defense/SLA thật | `ForcAD-demo/backend/lib/storage/round1.py` | [4.4](#44-round-1-3-task-ctf-attackdefense) |
| Chú giải luật điểm trên bản đồ (+100…) | `MekoDataCTF_Website/public/js/world.js` → `RULES` | [3.7](#37-world-arena--scoreboard) |
| Cổng scoreboard ForcAD (18080) | `ForcAD-demo/docker-compose.yml` | [4.2](#42-docker-và-cổng) |
| Mật khẩu admin ForcAD | 🔒 `ForcAD-demo/config.yml` → `admin.*` | [4.1](#41-forcad-democonfigyml) |
| Màu trạng thái UP/DOWN… trên bảng điểm ForcAD | `ForcAD-demo/front/src/config/index.js` | [4.7](#47-giao-diện-bảng-điểm-forcad-vue) |
| Bản đồ, vị trí đội, con giáp | `MekoDataCTF_Website/config/arenaMap.js`, `config/zodiac.js` | [3.7](#37-world-arena--scoreboard) |
| Bật/tắt lỗi IDOR/SQLi/Upload trên VM đội | `/etc/round1/web.json` trên VM → `patched` | [5.2](#52-cấu-hình-trên-vm-đội-và-máy-checker) |
| Chu kỳ checker sức khỏe trong sandbox | `.../provisioning/files/web-checker.service` | [6.2](#62-checker-sức-khỏe-trên-vm-checker) |
| Danh sách VM, IP trong sandbox | `checker-update/idor-c-main/topology.yml` | [6.1](#61-sandbox-definition) |
| SSH tới VM sandbox | 🔒 `ops/pool101/management-config` | [7](#7-ssh-vận-hành-pool-101) |

---

## 2. Áp dụng thay đổi

| Bạn sửa gì | Cần làm gì để có hiệu lực |
|---|---|
| Trang quản trị website (`/admin/...`) | Không cần làm gì — lưu là áp dụng ngay. |
| `MekoDataCTF_Website/.env` | Khởi động lại website (`npm start` / `npm run dev`). |
| File `.js` phía máy chủ của website (`app.js`, `config/`, `models/`, `controllers/`, `routes/`, `services/`, `middlewares/`) hoặc `locales/*.json` | Khởi động lại website. (`npm run dev` dùng `node --watch` nên tự khởi động lại.) |
| `MekoDataCTF_Website/views/*.ejs` | Tải lại trang khi chạy dev. Khi `NODE_ENV=production`, Express cache view → khởi động lại website. |
| `MekoDataCTF_Website/public/**` (CSS/JS/ảnh) | Tải lại trang (Ctrl+F5). Khi `NODE_ENV=production`, trình duyệt cache 7 ngày → Ctrl+F5 hoặc đổi tên file. |
| Hình học bản đồ (`config/arenaMap.js`, `views/partials/map-terrain.ejs`) | `npm run bake:map` (3–6 phút) rồi khởi động lại website. |
| `ForcAD-demo/config.yml` | Xem lưu ý ở [4.1](#41-forcad-democonfigyml): đa số giá trị `game.*` chỉ đọc lúc khởi tạo DB. |
| Code backend ForcAD (`ForcAD-demo/backend/**`) | Trong `ForcAD-demo`: `docker compose build <dịch vụ>` rồi `docker compose up -d --no-deps <dịch vụ>`. Dịch vụ thường dùng: `ticker`, `admin-api`, `client-api`, `http-receiver`, `celery`, `nginx`. **Không** dùng `control.py reset` hay `down -v` nếu muốn giữ dữ liệu. |
| Giao diện ForcAD (`ForcAD-demo/front/src/**`, `front/public/**`, `front/index.html`) | Trong `ForcAD-demo/front`: `npm run build`; rồi trong `ForcAD-demo`: `docker compose up -d --no-deps nginx`. |
| Checker ForcAD (`ForcAD-demo/checkers/**`) | Có hiệu lực ở lần chạy checker kế tiếp (thư mục được gắn vào container). |
| `ForcAD-demo/collect_checker.py` | Dừng collector đang chạy rồi chạy lại `python collect_checker.py` trong `ForcAD-demo`. |
| Sandbox (`topology.yml`, `provisioning/**`) | Đẩy lên nhánh Git mà Sandbox Definition đang dùng, rồi provisioning lại hoặc cấp sandbox mới (thêm/bớt VM **bắt buộc** cấp sandbox mới). |
| File cấu hình trên VM (`/etc/...`) | Sửa qua SSH quản trị rồi `sudo systemctl restart <service>`. |

---

## 3. Website MekoDataCTF (`MekoDataCTF_Website/`)

### 3.1 Biến môi trường (`.env`)

🔒 File `MekoDataCTF_Website/.env` (tạo từ `MekoDataCTF_Website/.env.example`).

| Biến | Mặc định | Dùng ở | Ý nghĩa |
|---|---|---|---|
| `PORT` | `3000` | `app.js` | Cổng website. |
| `NODE_ENV` | `development` | `app.js` | `production` bật: cookie `secure` (bắt buộc HTTPS), `trust proxy`, cache tĩnh 7 ngày, cache view. |
| `SESSION_SECRET` | (ngẫu nhiên mỗi lần chạy nếu thiếu) | `app.js` | Khóa ký cookie phiên. **Bắt buộc đặt** khi chạy thật; nếu thiếu, mọi người bị đăng xuất mỗi lần khởi động lại. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | — | `scripts/seed.js` | Tài khoản BTC. Đổi xong chạy `npm run seed` (mật khẩu ≥ 8 ký tự). |
| `FORCAD_URL` | `http://127.0.0.1:18080` | `routes/scoreboard.js`, `services/arenaService.js`, `scripts/sync-forcad-tokens.js` | Địa chỉ ForcAD để đọc điểm và chuyển flag. **Chưa có trong `.env.example`** — thêm tay nếu ForcAD không chạy ở cổng mặc định. |
| `DB_FILE` | `MekoDataCTF_Website/data/mekodata.db` | `config/database.js` | Đường dẫn SQLite. |
| `FORCAD_ADMIN_USER` | `forcad` | `scripts/sync-forcad-tokens.js` | Tài khoản admin ForcAD (chỉ dùng khi đồng bộ token). |
| `FORCAD_ADMIN_PASSWORD` | — (bắt buộc) | `scripts/sync-forcad-tokens.js` | 🔒 Lấy từ `ForcAD-demo/config.yml` → `admin.password`. |
| `BAKE_WIDTHS` | `1280,1920,2560,3840` | `scripts/bake-map.js` | Các độ rộng ảnh nền bản đồ cần dựng, vd. `BAKE_WIDTHS=1280` để xem thử nhanh. |

### 3.2 Trang quản trị `/admin` (không cần sửa code)

Đăng nhập bằng tài khoản BTC (mục 3.1). Giá trị lưu trong bảng `settings` của SQLite; mặc định nằm ở `models/Setting.js` → `DEFAULTS`.

| Trang | Mục | Khóa `settings` | Mặc định | Ảnh hưởng |
|---|---|---|---|---|
| `/admin/schedule` | Cho phép đăng ký / chỉnh sửa đội | `registration_open` | `1` | Tắt → không tạo tài khoản mới, đội trưởng không sửa được đội. |
| | Hạn đăng ký | `registration_deadline` | `2026-12-01T23:59` | Quá hạn → khóa đăng ký/sửa đội (`Setting.isRegistrationOpen`). |
| | Thời gian bắt đầu thi | `contest_start` | `2026-12-06T08:00` | Đồng hồ đếm ngược trang chủ, lịch thi. **Không** điều khiển ForcAD. |
| | Thời gian kết thúc thi | `contest_end` | `2026-12-06T17:00` | Hiển thị; phải sau giờ bắt đầu. |
| | Số thành viên tối thiểu | `min_members` | `1` | Chỉ được 1–4. |
| | Số thành viên tối đa | — | **4 (khóa)** | Xem 3.3. |
| | Địa điểm | `event_location` | Trường ĐH Cần Thơ — Khu II… | Hiển thị trang chủ. Tối đa 200 ký tự. |
| `/admin/contents` | Tiêu đề + nội dung từng mục (VI/EN) | bảng `contents` | `config/defaultContent.js` | Trang chủ. Mỗi dòng là một đoạn; dòng bắt đầu `- ` thành danh sách; FAQ dùng `Q:` / `A:`. |
| `/admin/teams` | Tìm, xem, xóa đội; xuất Excel/CSV | — | — | Xuất file: `services/exportService.js`. |
| `/admin/teams/<id>` | Xem token, **Cấp token mới**, **Tên đội trên ForcAD** | cột `teams.token`, `teams.forcad_name` | — | Xem 3.4. |

Khôi phục nội dung trang chủ về mặc định: `npm run seed -- --reset-content` (trong `MekoDataCTF_Website`).

### 3.3 Đăng ký đội và thành viên

| Quy tắc | Nơi chỉnh | Giá trị hiện tại |
|---|---|---|
| **Số thành viên tối đa / đội** | `models/Setting.js` → `const MAX_MEMBERS = 4;` | 4 — cố định, bỏ qua mọi giá trị `max_members` còn trong DB. |
| Số thành viên tối thiểu | `/admin/schedule` (bị kẹp trong 1..`MAX_MEMBERS` ở `Setting.all()`) | 1 |
| Độ dài tên đội | `controllers/teamController.js` → `validate()` | 2–50 ký tự, không trùng (không phân biệt hoa thường). |
| Trường/Khoa | `controllers/teamController.js` → `parseForm()` | Cắt còn 120 ký tự. |
| Họ tên thành viên | `controllers/teamController.js` → `parseForm()` | Cắt còn 80 ký tự. |
| MSSV | `controllers/teamController.js` → `STUDENT_ID_RE` | `^[A-Za-z0-9]{4,15}$`, không trùng giữa các đội. |
| Số điện thoại | `controllers/teamController.js` → `PHONE_RE` | `^[0-9+\s().-]{8,20}$` (không bắt buộc). |
| Email tài khoản | `controllers/authController.js` → `EMAIL_RE` | Tối đa 120 ký tự. |
| Mật khẩu tối thiểu | `controllers/authController.js` → `register` | 8 ký tự. |
| Thành viên đầu tiên là đội trưởng | `models/Member.js` → `replaceForTeam` | Thứ tự trong form. |
| Nút thêm/xóa dòng thành viên | `public/js/main.js` (đọc `data-max`/`data-min` của form) | Theo `MAX_MEMBERS` / tối thiểu. |
| Thông báo lỗi | `locales/vi.json`, `locales/en.json` → `team.errors.*` | — |

### 3.4 Đăng nhập và token đội

| Nội dung | Nơi chỉnh | Giá trị hiện tại |
|---|---|---|
| Định dạng token đội | `models/Team.js` → `TOKEN_RE`, `newToken()` | 16 ký tự hex (`crypto.randomBytes(8)`), cùng định dạng token ForcAD. **Đổi định dạng sẽ lệch với ForcAD.** |
| Giới hạn nhập sai token | `controllers/authController.js` → `TOKEN_MAX_FAILS`, `TOKEN_WINDOW_MS` | 10 lần / 10 phút / IP (lưu trong bộ nhớ, mất khi khởi động lại). |
| Thời hạn phiên đăng nhập | `app.js` → `cookie.maxAge` | 7 ngày. |
| Dọn phiên hết hạn | `app.js` → `SqliteStore … intervalMs` | 15 phút. |
| Ai được sửa đội | `middlewares/auth.js` → `requireCaptain` | Chỉ đội trưởng (tài khoản email). Thành viên token chỉ xem. |
| Cấp token cho đội cũ chưa có token | `config/database.js` (tự chạy khi khởi động) | Tự động. |
| Cấp token mới khi bị lộ | `/admin/teams/<id>` → **Cấp token mới** | Token cũ + phiên thành viên dùng token cũ mất hiệu lực ngay. **Sau đó phải đồng bộ lại sang ForcAD.** |
| Ghép đội website ↔ đội ForcAD | `/admin/teams/<id>` → **Tên đội trên ForcAD** (cột `teams.forcad_name`) | Trống = dùng tên đội website. Demo ForcAD dùng `team01`…`team04`. |

**Đồng bộ token sang ForcAD** (script `MekoDataCTF_Website/scripts/sync-forcad-tokens.js`):

```powershell
cd MekoDataCTF_Website
$env:FORCAD_ADMIN_PASSWORD = '<admin.password trong ForcAD-demo/config.yml>'
npm run sync:forcad                # xem kế hoạch, không ghi gì
npm run sync:forcad -- --apply     # ghi token website vào ForcAD
```

Chạy lại sau khi: thêm đội trên ForcAD, cấp token mới, đổi "Tên đội trên ForcAD", hoặc Round 1 **tái tạo** (ForcAD tự sinh lại token). Cần container `admin-api` có bản sửa `update_team` trong `ForcAD-demo/backend/lib/storage/teams.py` (gỡ token cũ khỏi Redis).

### 3.5 Nội dung, ngôn ngữ

| Nội dung | Nơi chỉnh |
|---|---|
| Mọi chuỗi giao diện (VI/EN) | `locales/vi.json`, `locales/en.json` |
| Ngôn ngữ hỗ trợ, ngôn ngữ mặc định (`vi`), cookie `lang` 1 năm | `middlewares/i18n.js` → `SUPPORTED` |
| Nội dung mặc định trang chủ | `config/defaultContent.js` (áp dụng bằng `npm run seed -- --reset-content`) |
| Menu điều hướng | `views/partials/navbar.ejs` |
| Footer | `views/layouts/main.ejs` + `locales/*.json` → `site.footer` |

### 3.6 Giao diện chung

| Nội dung | Nơi chỉnh |
|---|---|
| Bảng màu, font, bo góc trang công khai | `public/css/style.css` → `:root` (`--river-*`, `--rice-*`, `--sun-*`, `--radius`, `--font`, `--mono`) |
| Ảnh nền tòa ATL | `public/images/ctu-atl.jpg` (≈1920×1080); dự phòng `.png`/`.webp`/`.svg` theo thứ tự trong `style.css` → `.site-bg` |
| Logo / favicon | `public/images/favicon.svg`; scoreboard dùng `public/images/world.svg` |
| Chỉ hỗ trợ desktop: bề ngang tối thiểu | `public/css/style.css` → `body { min-width: 1200px }`; `admin.css` → `.admin-body { min-width: 1180px }`; `world.css` → `.arena.war { min-width: 1080px }` |
| Viewport | `views/layouts/main.ejs`, `views/layouts/admin.ejs` → `<meta name="viewport" content="width=1280">` |
| Giao diện khu quản trị (sidebar, thẻ, bảng, form) | `views/layouts/admin.ejs`, `public/css/admin.css` (token màu ở `.admin-body { --brand…; --gold…; }`) |
| Thứ tự/biểu tượng menu quản trị | `views/layouts/admin.ejs` → mảng `nav`, `icons` |

Lưu ý: CSP chặn `style="..."` và `<script>` nội tuyến — luôn dùng class CSS và file JS trong `public/js/`.

### 3.7 World Arena / Scoreboard

**Dữ liệu trực tiếp** — `services/arenaService.js`:

| Hằng số | Hiện tại | Ý nghĩa |
|---|---|---|
| `ORIGIN` | `FORCAD_URL` hoặc `http://127.0.0.1:18080` | Nguồn dữ liệu ForcAD. |
| `STATE_TTL` | 1500 ms | Dùng lại dữ liệu cho các yêu cầu sát nhau. |
| `TEAMS_TTL` | 30000 ms | Cache danh sách đội. |
| `PUSH_INTERVAL` | 2000 ms | Chu kỳ hỏi ForcAD khi có người xem (SSE). |
| `HEARTBEAT` | 15000 ms | Giữ kết nối SSE, đồng bộ đồng hồ. |
| `MAX_CLIENTS` | 500 | Số kết nối SSE tối đa; vượt thì trình duyệt chuyển sang AJAX. |

**Trình duyệt** — `public/js/arena.js`: hỏi lại mỗi 3000 ms (tab ẩn 15000 ms); SSE lỗi 3 lần liên tiếp thì chuyển sang AJAX.

**Hiển thị bản đồ** — `public/js/world.js`:

| Nội dung | Hằng số / vị trí | Hiện tại |
|---|---|---|
| Chú giải luật điểm | `RULES` | `{ flag: 100, sla: 100, down: 100 }` — **chỉ là chữ chú giải**, điểm thật do ForcAD tính (xem 4.4). |
| Màu từng đội | `COLORS` | 12 màu, đội thứ 13 trở đi lặp lại. |
| Ngưỡng "nhiều đội" (thu nhỏ linh thú/lãnh thổ) | `layoutTeams()` → `teams.length > 8` | > 8 đội; bán kính lãnh thổ 104 → 76. |
| Số đạn tối đa mỗi lần cập nhật | `slice(-12)` | 12. |
| Số điểm lấp lánh mặt biển | `sparkles()` → `i < 90` | 90. |
| Cỡ linh thú | `public/css/world.css` → `--emb` | 8cqi (≤ 8 đội), 5.6cqi (> 8 đội). |
| 4 căn cứ hiển thị trước khi có dữ liệu | `views/scoreboard.ejs` → `defaultTeams` | Team01–Team04. |
| Hiệu ứng động mặc định | Nút "Hiệu ứng động" trên trang | Theo `prefers-reduced-motion` của máy, nhớ trong `localStorage`. |

**Bản đồ & linh thú:**

| Nội dung | Nơi chỉnh | Ghi chú |
|---|---|---|
| Vị trí vùng đất của các đội (**số đội tối đa trên bản đồ**) | `config/arenaMap.js` → `SLOTS` | 16 vị trí; 4 đầu tiên trải đều hai lục địa. Quá 16 đội thì đặt lệch cạnh vị trí cũ. |
| Tên vùng đất | `config/arenaMap.js` → `LANDS` | 16 tên. |
| Hình lục địa, đảo, rừng, núi, sông, hồ, mặt trời | `config/arenaMap.js` (`LAND_W`, `LAND_E`, `ISLANDS`, `FORESTS`, `RANGES`, `RIVERS`, `LAKE`, `SUN`) | Đổi xong **bắt buộc** `npm run bake:map`. |
| Màu địa hình, biển, ánh nắng | `views/partials/map-terrain.ejs` (filter `terrain`, `sea-grad`…) | Đổi xong `npm run bake:map`. |
| Chất lượng/độ phân giải ảnh nền | `scripts/bake-map.js` → `WIDTHS`, chất lượng JPEG 84/88 | Kết quả ở `public/images/map/`. |
| Nhãn biển, radar GAMESERVER, thước tỉ lệ | `views/scoreboard.ejs` (SVG `map-overlay`) | Không cần bake. |
| 12 con giáp, hướng mặt, kiểu cử động | `config/zodiac.js` (+ ảnh `public/images/zodiac/<id>.png`) | Kiểu cử động định nghĩa ở `world.css` (`.z-hop`, `.z-stomp`…). |
| Bốc thăm con giáp cho đội | Bảng `settings` → khóa `arena_zodiac_seed` | Xóa khóa này rồi khởi động lại website để bốc thăm lại. |

### 3.8 Bảo mật web và giới hạn

| Nội dung | Nơi chỉnh | Hiện tại |
|---|---|---|
| Content-Security-Policy | `app.js` → `helmet({ contentSecurityPolicy })` | Chỉ cho phép tài nguyên cùng nguồn + Google Fonts. |
| Giới hạn dữ liệu gửi lên | `app.js` → `express.json({limit})`, `express.urlencoded({limit})` | JSON 20 KB, form 200 KB. |
| Số flag mỗi lần nộp | `routes/scoreboard.js` → `/scoreboard/submit` | 1–100 flag, mỗi flag ≤ 100 ký tự. |
| CSRF | `middlewares/csrf.js` | Mọi POST phải có `_csrf` hoặc header `X-CSRF-Token`. |

### 3.9 Lệnh npm (`MekoDataCTF_Website/package.json`)

| Lệnh | Việc |
|---|---|
| `npm start` | Chạy website. |
| `npm run dev` | Chạy và tự khởi động lại khi đổi code. |
| `npm run seed` | Tạo/cập nhật tài khoản BTC từ `.env`, nạp nội dung mặc định nếu DB trống. |
| `npm run seed -- --reset-content` | Ghi đè nội dung trang chủ bằng mặc định. |
| `npm run bake:map` | Dựng lại ảnh nền bản đồ 4K và mặt nạ biển. |
| `npm run sync:forcad [-- --apply]` | Đồng bộ token đội sang ForcAD. |

---

## 4. ForcAD (chấm điểm) (`ForcAD-demo/`)

### 4.1 `ForcAD-demo/config.yml`

🔒 File chứa mật khẩu admin và mật khẩu Postgres/Redis/RabbitMQ. Mẫu không có bí mật: `ForcAD-demo/config.yml.example`.

| Khóa | Hiện tại | Ý nghĩa |
|---|---|---|
| `game.mode` | `classic` | Chế độ chấm điểm gốc của ForcAD. |
| `game.round_time` | `60` | Thời lượng round (giây) cho chế độ health. **Round 1 tự ghi đè thành 120** khi bấm "Chuẩn bị Round 1" (xem 4.4). |
| `game.start_time`, `game.timezone` | 2026-10-27 15:52:03, `Asia/Ho_Chi_Minh` | Mốc bắt đầu theo ForcAD gốc. |
| `game.flag_lifetime` | `5` | Số round flag còn hiệu lực (ForcAD gốc). Round 1 ghi đè thành 2. |
| `game.default_score`, `game.game_hardness`, `game.inflation`, `game.volga_attacks_mode` | 2500, 10.0, true, false | Công thức điểm attack gốc của ForcAD (hàm SQL `recalculate_rating` ở `backend/scripts/create_functions.sql`). Round 1 không dùng công thức này. |
| `game.checkers_path`, `game.env_path` | `/checkers/`, `''` | Thư mục checker trong container. |
| `admin.username`, `admin.password` 🔒 | `forcad`, (ẩn) | Đăng nhập `http://127.0.0.1:18080/admin/` và API quản trị. |
| `storages.db.*`, `storages.redis.*`, `storages.rabbitmq.*` 🔒 | host/port/user/(mật khẩu ẩn) | Kết nối dịch vụ nội bộ. Do `control.py setup` sinh. |
| `tasks` | 2 mục mẫu | Bài ban đầu khi khởi tạo. Bài thật được tạo/bật qua admin hoặc nút "Chuẩn bị Round 1". |
| `teams` | 2 mục mẫu | Đội ban đầu khi khởi tạo. Bốn đội thật `team01`–`team04` được tạo bởi `configure_mekodata_demo.py`. |

Lưu ý quan trọng:

- Các giá trị `game.*`, `tasks`, `teams` được nạp vào DB **khi khởi tạo lần đầu**. Sửa `config.yml` sau đó **không** đổi cuộc thi đang có, trừ khi khởi tạo lại DB — mà khởi tạo lại sẽ **xóa toàn bộ dữ liệu**.
- `python control.py setup` đọc `config.yml`, sao lưu config (`config_backup_<thời điểm>.yml`), sinh thông tin storage/admin và tạo `docker-compose-base.yml`.

Lệnh `ForcAD-demo/control.py` (định nghĩa ở `ForcAD-demo/cli/base/`):

| Lệnh | Việc | Mức nguy hiểm |
|---|---|---|
| `python control.py setup` | Chuẩn bị cấu hình, sinh compose base | Thấp |
| `python control.py start --fast` / `start` | Chạy toàn hệ thống (`--fast` dùng image dựng sẵn) | Thấp |
| `python control.py build` | Build image | Thấp |
| `python control.py pause` / `resume` | Dừng / tiếp tục cập nhật round và nhận flag (ForcAD gốc) | Trung bình |
| `python control.py print_tokens` | In token các đội | 🔒 Lộ token |
| `python control.py scale` / `worker` | Tăng số worker | Thấp |
| `python control.py rd logs -f <dịch vụ>` | Xem log | Thấp |
| `python control.py reset` | **Xóa toàn bộ dữ liệu cuộc thi** | Rất cao |
| `python control.py clean` | Dọn tài nguyên sau khi chạy | Cao |

### 4.2 Docker và cổng

| Nội dung | Nơi chỉnh | Hiện tại |
|---|---|---|
| Cổng scoreboard/API ra ngoài | `ForcAD-demo/docker-compose.yml` → dịch vụ `nginx` → `ports` | `127.0.0.1:18080:80` (chỉ máy Windows truy cập được). Đổi thành `0.0.0.0:18080:80` để mở cho mạng LAN — cân nhắc bảo mật trang `/admin/`. |
| Thư mục `front/dist` phục vụ bởi nginx | `ForcAD-demo/docker-compose.yml` → `nginx` volumes (`./front/dist/:/var/www/front:ro`) | — |
| Gắn thư mục `checkers` vào các container | `ForcAD-demo/docker-compose.yml` và `ForcAD-demo/docker-compose-base.yml` (`./checkers/:/checkers/`) | Cần cho cầu nối collector ↔ checker. |
| Tài khoản admin dạng biến môi trường cho container | 🔒 `ForcAD-demo/docker_config/services/admin.env` | Do `control.py setup` sinh từ `config.yml`, không sửa tay. |
| Dữ liệu PostgreSQL | `ForcAD-demo/docker_volumes/postgres/data` | Không xóa nếu muốn giữ kết quả. |
| Bản sao lưu DB trước các lần sửa lớn | `ForcAD-demo/forcad-before-*.dump` | 🔒 |

### 4.3 Đội và bài trên ForcAD

| Nội dung | Nơi chỉnh |
|---|---|
| Thêm/sửa/tắt đội, IP, đánh dấu nổi bật | `http://127.0.0.1:18080/admin/` → **Thêm đội** / biểu tượng sửa cạnh tên đội |
| Thêm/sửa/tắt bài (task), checker, timeout, puts/gets | `http://127.0.0.1:18080/admin/` → **Thêm dịch vụ** / sửa cạnh tên bài |
| Đăng ký nhanh 4 đội demo `team01`–`team04` (IP `10.80.0.11`–`14`) và bài health | `ForcAD-demo/configure_mekodata_demo.py` (dùng `range(1, 5)`) |
| Token đội trên ForcAD | Sinh tự động (`backend/lib/models/team.py` → `generate_token`, 16 hex). Thay bằng token website qua `npm run sync:forcad -- --apply` (mục 3.4). |
| Xem lịch sử checker từng đội/bài | `/admin/` → biểu tượng đồng hồ trong ô dịch vụ |

### 4.4 Round 1 (3 task, CTF Attack/Defense)

File chính: `ForcAD-demo/backend/lib/storage/round1.py`. Phần lớn giá trị đang **viết cứng trong code**:

| Thông số | Vị trí | Hiện tại |
|---|---|---|
| Thời lượng tick | `prepare` → `UPDATE GameConfig SET round_time=120 …` (≈ dòng 133) | 120 giây. Bị ghi đè mỗi lần "Chuẩn bị Round 1". |
| Thời gian sống của flag | cùng câu lệnh trên → `flag_lifetime=2` | Tick tạo + 2 tick sau. |
| Số tick mỗi round | `tick < 15` và `15 + …` (≈ dòng 266, 270) | 15 tick. |
| Cửa sổ nhận flag cuối round | `time.time()+2*tick_seconds` (≈ dòng 266) | 2 × tick = 240 giây. |
| Thử lại PUT flag khi thất bại | `PUT_RETRY_SECONDS` (đầu file) | 10 giây. |
| Điểm Attack / Defense | `record_attack` → `stolen=stolen+1,score=score+1` / `lost=lost+1,score=score-1`, `attacker_delta = 1.0` (≈ dòng 312–323) | +1 cho đội tấn công, −1 cho đội mất flag. |
| Điểm SLA mỗi tick | `points = int(status == 101)` (≈ dòng 261) | +1 khi đủ 3 task đều UP. |
| Công thức tổng | `scores()` → `attack - lost + sla` | Có thể âm. |
| Số đội bắt buộc khi chuẩn bị | `prepare` → `!= 4` + danh sách IP `10.80.0.11`–`14` (≈ dòng 118–120) | Đúng 4 đội đang hoạt động với 4 IP đó. |
| Máy kiểm tra khi tái tạo | `expected_hosts = ['attacker1', …, 'attacker4']` (≈ dòng 378) | 4 VM. |
| Sinh lại token đội khi tái tạo | `UPDATE Teams SET token=…` (≈ dòng 406) | Có — nhớ chạy lại đồng bộ token. |
| Hiển thị "Round x / Tick y/15", "max 2 round" | `ForcAD-demo/backend/services/api/views.py` → `'max_rounds': 2, 'ticks_per_round': 15` | Chỉ là số hiển thị; phải khớp với `round1.py`. |
| Checker từng task | `ForcAD-demo/checkers/round1/idor.py`, `sqli.py`, `upload.py`, `health.py`, `common.py` | `common.py` chỉ chấp nhận IP `10.80.0.11`–`14`. |
| Bảng điều khiển round (Chuẩn bị / Bắt đầu / Dừng / Đóng và lưu hồ sơ) | `ForcAD-demo/front/public/round-control.js` (giao diện), API ở `backend/services/admin/viewsets/round_control.py` | Hiện trên trang `/` khi đăng nhập admin. |
| Trang nộp flag của ForcAD | `ForcAD-demo/front/public/submit.html` | Dùng team token. |

Quy trình vận hành Round 1 (chuẩn bị, bắt đầu, dừng, lưu hồ sơ, tái tạo): `round1-lab/README.md`.

### 4.5 Chế độ health-only (bản thử trước Round 1)

| Thông số | Vị trí | Hiện tại |
|---|---|---|
| Thời lượng tick | `config.yml` → `game.round_time` | 60 giây. |
| Tổng số tick tối đa | `ForcAD-demo/backend/lib/storage/round_control.py` → `CHECK (tick BETWEEN 1 AND 30)`, `>= 30` | 30 tick (2 round × 15). |
| Điểm mỗi tick UP | `ForcAD-demo/backend/lib/storage/tasks.py` → ghi `MekodataTickResults … points = passed` | UP +1, DOWN 0. |
| Chặn dùng lại cùng lượt checker | `tasks.py` → `Checker cycle already used` | Lượt trùng → CHECK FAILED. |
| Điều kiện reset điểm | `round_control.py` → phải dừng ≥ 30 giây, đúng 1 dịch vụ, chưa có flag | — |

### 4.6 Collector (Windows) và adapter checker

| Thông số | Vị trí | Hiện tại |
|---|---|---|
| File cấu hình SSH | `ForcAD-demo/collect_checker.py` → `ssh -F pool101-management-config` | Tìm ở **thư mục gốc workspace** (xem lưu ý ở mục 7). |
| Lệnh chạy checker trên VM | `collect_checker.py` → `REMOTE` | `web_health.py --config /etc/web-checker/web_targets.json … --database /var/lib/web-checker/results.sqlite3` |
| Thời gian chờ SSH | `collect_checker.py` → `ConnectTimeout=8`, `timeout=15` / `timeout=25` | — |
| Số đội phải có trong một lượt | `collect_checker.py` → `expected = {f'team0{i}' for i in range(1, 5)}`, `!= 4` | 4 đội `team01`–`team04`. |
| Thư mục cầu nối ticker ↔ collector | `ForcAD-demo/checkers/mekodata_bridge/` (`request.json`), `ForcAD-demo/checkers/round1/rpc/` | — |
| Ánh xạ IP → tên đội của adapter health | `ForcAD-demo/checkers/mekodata_bridge/bridge.py` → `MAPPING` | `10.80.0.11`→`team01` … `10.80.0.14`→`team04`. |
| Mã trả về cho ForcAD | `bridge.py` | 101 UP, 104 DOWN, 110 CHECK FAILED. |
| Log collector | `ForcAD-demo/collector.log`, `ForcAD-demo/collector-error.log` | — |

Collector **không tự chạy** sau khi Windows khởi động lại; chỉ chạy **một** tiến trình cùng lúc (`python collect_checker.py` trong `ForcAD-demo`).

### 4.7 Giao diện bảng điểm ForcAD (Vue)

| Nội dung | Nơi chỉnh |
|---|---|
| Tên và màu trạng thái UP/CORRUPT/MUMBLE/DOWN/CHECK FAILED | `ForcAD-demo/front/src/config/index.js` → `statusesNames`, `statusTheme` |
| Màu huy hiệu hạng 1–3 | `ForcAD-demo/front/src/config/index.js` → `topTeamColors` |
| Bảng màu nền tối, font | `ForcAD-demo/front/src/assets/table.scss` → `:root` (`--bg`, `--panel`, `--accent-teal`, `--mono`, `--sans`) |
| Tỉ lệ cột bảng điểm | `ForcAD-demo/front/src/assets/table.scss` → `.board { --grid }`, `.board--dense` (> 4 dịch vụ) |
| Bề ngang tối đa trang | `ForcAD-demo/front/src/components/Lib/Container.vue` → `max-width: 1680px` |
| Thanh trên (tên giải, tick) | `ForcAD-demo/front/src/components/General/Topbar.vue` |
| Font, tiêu đề tab, script phụ | `ForcAD-demo/front/index.html` |
| Panel "Live arena" + điều khiển round ở trang `/` | `ForcAD-demo/front/public/tick-display.js`, `round-control.js`, `arena.css`, `arena.js` |
| URL backend khi chạy `npm run dev` | `ForcAD-demo/front/src/config/index.js` → `http://127.0.0.1:8080` (khác cổng 18080 của compose — sửa nếu cần dev riêng) |

Áp dụng: `npm run build` trong `ForcAD-demo/front`, rồi `docker compose up -d --no-deps nginx` trong `ForcAD-demo`.

---

## 5. Lab Round 1 (`round1-lab/`)

### 5.1 Script trên máy Windows

| Thông số | Vị trí | Hiện tại |
|---|---|---|
| Danh sách VM đội và IP | `round1-lab/deploy.py` (`range(1, 5)`, `10.80.0.{10+i}`), `round1-lab/recycle.py` → `HOSTS`, `TEAM_IPS` | `attacker1`–`4`, `10.80.0.11`–`14`. |
| Token quản trị web lab của từng VM | 🔒 `round1-lab/.secrets/teams.json` | Sinh khi deploy lần đầu (`secrets.token_hex(32)`). **Không xóa** — mất là checker không đặt/đọc flag được. Đây **khác** token đội nộp flag. |
| Cài lab + agent lên sandbox | `python round1-lab/deploy.py --apply` | Không có `--apply` thì chỉ in kế hoạch. |
| Đóng cuộc thi và tái tạo 4 VM | `python round1-lab/recycle.py --archive-id <UUID>` | Xem `round1-lab/README.md`. |
| Kiểm thử cô lập | `python round1-lab/run_tests.py` | Cần Docker Desktop đang chạy. |

### 5.2 Cấu hình trên VM đội và máy checker

| File (trên VM) | Nội dung | Áp dụng |
|---|---|---|
| `/etc/round1/web.json` (VM đội) 🔒 | `node`, `data_dir`, `admin_token`, `patched: { idor, sqli, upload }` | Đặt `patched.<lỗi> = true` để vá mẫu lỗi đó; rồi `sudo systemctl restart attacker-http@attackerN`. |
| `/opt/round1/webservice.py` (VM đội) | Mã web lab; người chơi được sửa để tự vá | `sudo systemctl restart attacker-http@attackerN` (quyền giới hạn cho `user-access`). |
| `/etc/systemd/system/attacker-http@attackerN.service.d/round1.conf` | Drop-in chạy webservice cổng 80 | Xóa file + `daemon-reload` để hoàn tác về web cũ. |
| `/var/lib/round1-web` | Dữ liệu lab (SQLite, flag, upload) | Bị xóa khi tái tạo. |
| `/etc/round1/agent.json` (máy checker) 🔒 | URL + token của 4 đội | Do `deploy.py` ghi. |
| `/opt/round1/agent.py` (máy checker) | Agent nhận lệnh CHECK/PUT/GET qua SSH | — |

---

## 6. Sandbox CyberRange và checker

Có **ba bản** của cùng Sandbox Definition trong workspace: `checker-update/idor-c-main/` (bản đang dùng, có VM checker), `MekoDataCTF-review/`, `mekodata-publish/`. `topology.yml` và `checker/web_targets.json` của ba bản giống nhau; riêng `mekodata-publish/provisioning/playbook.yml` **khác** hai bản còn lại. Sửa ở bản nào thì phải đẩy đúng bản đó lên repo Git mà Sandbox Definition đang dùng.

### 6.1 Sandbox Definition

| Nội dung | Nơi chỉnh (trong `checker-update/idor-c-main/`) | Hiện tại |
|---|---|---|
| Danh sách VM, image, flavor | `topology.yml` → `hosts` | `attacker1`–`4` (kali), `server`, `checker`, `gateway` (debian-12). |
| Mạng và IP | `topology.yml` → `networks`, `net_mappings`, `router_mappings` | `lab-lan` `10.80.0.0/24`; attacker `.11`–`.14`, server `.20`, checker `.30`, gateway `.1`. |
| Nhóm máy đội | `topology.yml` → `groups: attackers` | 4 attacker. |
| Biến provisioning (IP, mật khẩu lab) | 🔒 `provisioning/group_vars/all.yml` → `lab_hosts`, `lab_attackers`, `lab_console_password`, `lab_web_password`, `lab_enforce_owner` | `lab_enforce_owner: false` = ServiceDesk để ngỏ lỗi IDOR. |
| Các bước cài đặt, kiểm tra luồng mạng | `provisioning/playbook.yml` | — |
| Tường lửa chặn attacker → server | `provisioning/files/server-acl.nft`, `apply_server_acl.py`, `idor-server-acl.service` | — |
| Dịch vụ web trên attacker | `provisioning/files/attacker-http@.service`, `app/attacker_http.py` | Endpoint `/health`. |
| ServiceDesk | `provisioning/files/servicedesk.service`, `app/portal.py`, `app/portal.html` | — |
| Bài training trên CyberRange | `training-definition.json` | — |

Thêm/bớt VM **không** áp dụng được cho sandbox cũ bằng provisioning lại — phải cấp sandbox mới.

### 6.2 Checker sức khỏe trên VM checker

| Thông số | Vị trí | Hiện tại |
|---|---|---|
| Danh sách đích kiểm tra | `checker-update/idor-c-main/checker/web_targets.json` (trước provisioning) hoặc `/etc/web-checker/web_targets.json` (trên VM) | `team01`–`team04` → `http://10.80.0.11-14/health`, kèm `expected_node`. Có thể thêm `expected_sandbox`. |
| Chu kỳ và timeout | `provisioning/files/web-checker.service` → `ExecStart … --interval 60 --timeout 3` | 60 giây/lượt, 3 giây/request. |
| Tự khởi động lại khi lỗi | `web-checker.service` → `Restart=on-failure`, `RestartSec=3` | — |
| Nơi lưu kết quả | `/var/lib/web-checker/results.sqlite3` (bảng `check_cycles`, `check_results`) | Không tự xóa lịch sử. |
| Logic kiểm tra UP/DOWN | `checker/web_health.py` → `check_web` | HTTP 200 + JSON `status: ok` + đúng `node`. |

Áp dụng trên VM: sửa `/etc/web-checker/web_targets.json` rồi `sudo systemctl restart web-checker`.

### 6.3 Checker ServiceDesk độc lập (`service-checker/`)

| Nội dung | Nơi chỉnh |
|---|---|
| Cấu hình theo mã nguồn gốc (4 attacker + ServiceDesk) | `service-checker/config.source.json` |
| Cấu hình theo mô hình team01–04 cổng 8080 | `service-checker/config.teams.json` |
| Đích health | `service-checker/web_targets.json` |
| Mật khẩu web từng đội | Biến môi trường `CHECKER_TEAM01_PASSWORD` … `CHECKER_TEAM04_PASSWORD` (hoặc `CHECKER_SERVER_PASSWORD`) — nhập ẩn, không ghi vào file. |

---

## 7. SSH vận hành (Pool 101)

| File | Nội dung |
|---|---|
| 🔒 `ops/pool101/management-config` | Cấu hình SSH: `ProxyJump` qua MAN, alias `attacker1`–`4`, `server`, `checker`, `gateway`, đường dẫn khóa riêng. |
| 🔒 `ops/pool101/known-hosts` | Host key đã tin. |

⚠️ **Lệch tên/đường dẫn cần xử lý trước khi chạy:** `ForcAD-demo/collect_checker.py`, `round1-lab/deploy.py` và `round1-lab/recycle.py` đều gọi `ssh -F pool101-management-config` với thư mục làm việc là **thư mục gốc workspace**, tức tìm file `D:\TAILIEU\LVTN\MEKOSHARING\pool101-management-config`. Trong repo, file lại nằm ở `ops/pool101/management-config`. Ngoài ra, `management-config` đang trỏ `UserKnownHostsFile` và khóa riêng tới đường dẫn trên máy tác giả (`C:/Users/Nguyen Thanh Dat/...`). Khi chạy trên máy khác cần:

1. Chép `ops/pool101/management-config` thành `pool101-management-config` ở thư mục gốc workspace (hoặc sửa tham số `-F` trong ba script trên).
2. Sửa `UserKnownHostsFile` và `IdentityFile` trong file đó theo đường dẫn trên máy hiện tại.

Khi cấp pool/sandbox mới: tải lại **SSH Management Access** từ CyberRange và thay hai file trên. Nếu SSH báo host key thay đổi, dừng lại và xác minh với quản trị viên.

---

## 8. Kịch bản thường gặp

### 8.1 Thay đổi số lượng đội

Số đội **không** nằm ở một chỗ. Hiện cả hệ thống được dựng cho **đúng 4 đội** (`team01`–`team04`, IP `10.80.0.11`–`14`). Muốn đổi, phải sửa đồng bộ:

| Tầng | Việc cần làm | File |
|---|---|---|
| Website — đăng ký | Không có giới hạn số đội; khống chế bằng **đóng đăng ký** / **hạn đăng ký** | `/admin/schedule` |
| Sandbox — VM | Thêm/bớt `attackerN`, IP, nhóm `attackers` | `checker-update/idor-c-main/topology.yml`, `provisioning/group_vars/all.yml` (+ cấp sandbox mới) |
| Checker sức khỏe | Thêm/bớt đích | `checker/web_targets.json` hoặc `/etc/web-checker/web_targets.json` |
| SSH | Thêm alias `Host attackerN` | 🔒 `ops/pool101/management-config` |
| Lab Round 1 | Sửa `range(1, 5)`, `range(11, 15)`, `HOSTS`, `TEAM_IPS` | `round1-lab/deploy.py`, `round1-lab/recycle.py` |
| ForcAD — đội | Tạo đội + IP | `/admin/` của ForcAD, hoặc `ForcAD-demo/configure_mekodata_demo.py` |
| ForcAD — Round 1 | Sửa điều kiện `!= 4` + danh sách IP; `expected_hosts` | `ForcAD-demo/backend/lib/storage/round1.py` |
| ForcAD — checker round1 | Sửa tập IP hợp lệ | `ForcAD-demo/checkers/round1/common.py` |
| Collector / adapter health | Sửa `expected` + `!= 4`; `MAPPING` | `ForcAD-demo/collect_checker.py`, `ForcAD-demo/checkers/mekodata_bridge/bridge.py` |
| Bản đồ World Arena | ≤ 16 đội có sẵn vị trí; nhiều hơn → thêm `SLOTS`/`LANDS` rồi `npm run bake:map` | `MekoDataCTF_Website/config/arenaMap.js` |
| Con giáp | ≤ 12 đội có con riêng; nhiều hơn sẽ lặp lại (khác màu) | `MekoDataCTF_Website/config/zodiac.js` |
| Token đội | Khai "Tên đội trên ForcAD" cho đội mới rồi đồng bộ | `/admin/teams/<id>`, `npm run sync:forcad -- --apply` |

### 8.2 Đổi thời lượng tick hoặc số tick

- **Round 1:** sửa `round_time=120` / `flag_lifetime=2` và các chỗ `15` trong `ForcAD-demo/backend/lib/storage/round1.py`; sửa số hiển thị `ticks_per_round`, `max_rounds` trong `ForcAD-demo/backend/services/api/views.py`; build + khởi động lại `ticker`, `client-api`, `admin-api`. Thời lượng tick mới có hiệu lực từ lần "Chuẩn bị Round 1" kế tiếp.
- **Health-only:** `config.yml` → `game.round_time` (chỉ khi khởi tạo DB) và giới hạn 30 tick trong `round_control.py`.
- Đồng hồ trên website và bảng điểm ForcAD tự đọc `tick_seconds` từ API, không cần sửa.

### 8.3 Đổi luật điểm

- **Điểm thật** (được cộng/trừ trong DB): `ForcAD-demo/backend/lib/storage/round1.py` → `record_attack` (attack/defense) và đoạn ghi `MekodataSLA` (SLA). Điểm health-only: `ForcAD-demo/backend/lib/storage/tasks.py`.
- **Chú giải trên bản đồ** (+100 / −100 × số đội còn lại): `MekoDataCTF_Website/public/js/world.js` → `RULES`. Số nổi trên bản đồ luôn là chênh lệch điểm thật lấy từ ForcAD, nên phải sửa backend thì số mới khớp chú giải.

### 8.4 Mở/đóng đăng ký, đổi lịch thi

`/admin/schedule` → bật/tắt "Cho phép đăng ký", đổi hạn đăng ký, giờ bắt đầu/kết thúc. Giờ trên website **không** khởi động ForcAD: round chỉ bắt đầu khi BTC bấm **Bắt đầu** trên bảng điều khiển ở `http://127.0.0.1:18080/`.

### 8.5 Đổi cổng hoặc địa chỉ ForcAD

1. `ForcAD-demo/docker-compose.yml` → `nginx.ports`, rồi `docker compose up -d nginx`.
2. `MekoDataCTF_Website/.env` → `FORCAD_URL`, rồi khởi động lại website.
3. Khi đồng bộ token: `FORCAD_URL` trong lệnh `npm run sync:forcad`.
4. `ForcAD-demo/configure_mekodata_demo.py` dùng `http://127.0.0.1:18080` cứng (biến `base`); `round1-lab/recycle.py` nhận tham số `--api` (mặc định `http://127.0.0.1:18080`).

### 8.6 Đổi mật khẩu

| Tài khoản | Cách đổi |
|---|---|
| BTC website | Sửa `ADMIN_PASSWORD` trong `MekoDataCTF_Website/.env` → `npm run seed`. |
| Đội trưởng | Chưa có chức năng tự đổi mật khẩu trên giao diện. |
| Admin ForcAD | 🔒 `ForcAD-demo/config.yml` → `admin.password`, rồi `python control.py setup` (ghi lại 🔒 `ForcAD-demo/docker_config/services/admin.env`) và khởi động lại `admin-api`. |
| Console/ web lab ServiceDesk | 🔒 `checker-update/idor-c-main/provisioning/group_vars/all.yml`, provisioning lại. |
| Tài khoản `debian` trên VM | SSH vào VM → `sudo passwd debian`. |

### 8.7 Token đội bị lộ

1. `/admin/teams/<id>` → **Cấp token mới**.
2. `npm run sync:forcad -- --apply` (mục 3.4).
3. Đội trưởng gửi token mới cho thành viên (xem ở **Đội của tôi**).

### 8.8 Chuẩn bị cuộc thi mới trên cùng 4 VM

1. Trên `http://127.0.0.1:18080/`: **Dừng** → **Đóng và lưu hồ sơ** → **Tải hồ sơ JSON** (🔒 lưu ngoài workspace).
2. `python round1-lab/recycle.py --archive-id <UUID>`.
3. `npm run sync:forcad -- --apply` (ForcAD vừa sinh lại token).
4. **Chuẩn bị Round 1 (3 task)** → **Bắt đầu**.

Chi tiết: `round1-lab/README.md`.

### 8.9 Nạp giao diện ForcAD mới lên hệ thống

```powershell
cd ForcAD-demo\front
npm install
npm run build
cd ..
docker compose up -d --no-deps nginx
```

---

## 9. Những thứ chưa cấu hình được (phải sửa code)

| Nhu cầu | Hiện trạng | Chỗ phải sửa |
|---|---|---|
| Giới hạn tổng số đội được đăng ký trên website | Không có giới hạn | `controllers/authController.js` (`register`) hoặc `controllers/teamController.js` (`save`) |
| Đổi số tick, thời lượng tick Round 1 qua giao diện | Viết cứng | `ForcAD-demo/backend/lib/storage/round1.py`, `backend/services/api/views.py` |
| Luật điểm 100 / phạt theo số đội | Backend vẫn tính +1/−1/+1; 100 chỉ là chú giải | `round1.py` (`record_attack`, SLA), `public/js/world.js` (`RULES`) |
| Tự chạy Round 2 | Chưa có | `round1.py` |
| Số đội khác 4 | Viết cứng ở nhiều nơi | Xem 8.1 |
| Đội trưởng tự đổi mật khẩu / quên mật khẩu | Chưa có | `controllers/authController.js`, `routes/auth.js` |
| Feed "đòn bị chặn" (flag cũ/sai/trùng) trên bản đồ | ForcAD chưa trả `defends`; website đã sẵn sàng nhận | `ForcAD-demo/backend/services/api/views.py` (endpoint `/api/client/arena/`) |
| Collector tự chạy khi Windows khởi động | Chưa có | Task Scheduler của Windows hoặc dịch vụ riêng |
| Số thành viên tối đa khác 4 | Cố định theo yêu cầu | `MekoDataCTF_Website/models/Setting.js` → `MAX_MEMBERS` |
