# MekoDataCTF Website

Website giới thiệu và đăng ký thi MekoDataCTF — Node.js/Express, mô hình MVC, song ngữ Việt/Anh.

## Chức năng
- **Thí sinh**: đăng ký / đăng nhập bằng email; khai báo đội (tên đội, trường/khoa, SĐT, từng thành viên gồm họ tên + MSSV). Sửa được đến hạn đăng ký.
- **Ban tổ chức** (`/admin`): xem thống kê; sửa nội dung trang chủ (VI + EN); đặt hạn đăng ký, thời gian bắt đầu/kết thúc, số thành viên tối thiểu (tối đa **cố định 4 thành viên/đội**, `Setting.MAX_MEMBERS`); bật/tắt đăng ký; tìm/xem/xóa đội; **xuất Excel (.xlsx) và CSV**.
- Trang chủ: banner nền tòa ATL – ĐH Cần Thơ, đồng hồ đếm ngược, lịch thi, thể lệ, giải thưởng, hỏi đáp.

## Cài đặt & chạy
```bash
npm install
cp .env.example .env        # sửa SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run seed                # tạo tài khoản BTC + nội dung mặc định
npm run dev                 # http://localhost:3000
```
Đổi mật khẩu BTC: sửa `.env` rồi chạy lại `npm run seed`.
Khôi phục nội dung mặc định: `npm run seed -- --reset-content`.

## Chỉ hỗ trợ desktop

Toàn bộ website (trang công khai, khu quản trị, World Arena) chỉ nhắm **màn hình desktop**:

- `views/layouts/main.ejs` và `views/layouts/admin.ejs` đặt `<meta name="viewport" content="width=1280">`, nên điện thoại thu nhỏ trang thay vì xếp lại bố cục.
- `body { min-width: 1200px }` trong `style.css`; khu quản trị 1180px, bản đồ arena 1080px.
- `style.css` không còn media query cho điện thoại/tablet, cũng không còn menu hamburger (`.nav-toggle`) — thanh điều hướng luôn hiện đầy đủ. Chỉ giữ `@media (prefers-reduced-motion: reduce)` vì đây là tùy chọn trợ năng.
- Khi thêm giao diện mới, không cần viết breakpoint cho điện thoại.

## Ảnh nền
Lưu ảnh tòa ATL vào **`public/images/ctu-atl.jpg`** (khoảng 1920×1080). Khi chưa có ảnh, website dùng minh họa `public/images/ctu-atl.svg`.

## Cấu trúc MVC
```
app.js            khởi tạo Express, middleware, routes
config/           kết nối SQLite, schema, nội dung mặc định, arenaMap, zodiac
models/           User, Team, Member, Setting, Content   (M)
views/            EJS: layouts (main, admin), partials, home, auth, team, admin   (V)
controllers/      home, auth, team, admin   (C)
routes/           ánh xạ URL → controller
middlewares/      auth, i18n, csrf, locals
services/         exportService (xlsx/csv), arenaService (dữ liệu World Arena)
helpers/          định dạng nội dung, ngày giờ
locales/          vi.json, en.json
public/           css (style, admin, arena, world), js, images
scripts/           seed.js (tài khoản BTC), bake-map.js (ảnh nền bản đồ)
```
Dữ liệu lưu ở `data/mekodata.db` (SQLite).

## Khu quản trị BTC (`/admin`)

- Dùng khung riêng `views/layouts/admin.ejs` + `public/css/admin.css`: sidebar cố định (Tổng quan · Danh sách đội · Thời gian thi · Nội dung trang), thanh tiêu đề có mô tả trang và chuyển VI/EN, vùng nội dung nền sáng. Không dùng ảnh nền/navbar/footer của trang công khai để bảng số liệu dễ đọc.
- `routes/admin.js` đặt `res.locals.layout = 'layouts/admin'` cho mọi route con, nên thêm trang mới chỉ cần viết phần thân.
- Thành phần dùng lại: `.a-card`, `.a-stat`, `.a-table`, `.a-pill`, `.a-btn` (primary/soft/ghost/danger), `.a-fieldset` + `.a-fields`, `.a-switch`, `.a-section` (khối nội dung song ngữ), `.a-sticky-save`.
- **Không dùng `style=""` nội tuyến** trong view: CSP của `helmet` chặn inline style, hãy thêm class vào `admin.css`.
- Giao diện quản trị hướng tới **desktop** (`min-width` 1180px).

## Token đội (đăng nhập thành viên & nộp flag)

- Khi đội trưởng tạo đội thành công, website cấp **token đội** 16 ký tự hex (`teams.token`, cùng định dạng `secrets.token_hex(8)` của ForcAD). Token hiện ở trang **Đội của tôi** (nút Hiện / Sao chép).
- **Đội trưởng** đăng nhập bằng email + mật khẩu và là người duy nhất được sửa đội. **Thành viên** đăng nhập ở cột phải trang `/login` bằng token đội (`POST /login/token`): phiên gắn với đội (`session.teamId` + `session.teamToken`), chỉ xem được trang đội, không sửa được.
- Nhập sai token 10 lần trong 10 phút từ cùng một IP thì bị chặn tạm (HTTP 429).
- **Nộp flag** (`POST /scoreboard/submit`) chỉ nhận khi đã đăng nhập (đội trưởng hoặc thành viên). Máy chủ lấy token của **đội đang đăng nhập** để gửi `X-Team-Token` sang ForcAD; token trong request của trình duyệt bị bỏ qua, nên không nộp hộ được cho đội khác.
- BTC xem token, **cấp token mới** khi bị lộ (token cũ và mọi phiên thành viên dùng token cũ mất hiệu lực ngay), và khai **Tên đội trên ForcAD** ở trang chi tiết đội trong `/admin`.
- DB cũ được tự nâng cấp khi khởi động (`config/database.js`): thêm cột `token`, `forcad_name` và cấp token cho các đội đã đăng ký trước đó.

### Đồng bộ token sang ForcAD

ForcAD chỉ cộng điểm cho đội có token trùng token nó đang lưu, mà ForcAD tự sinh token riêng khi tạo đội. Website là nơi cấp token, nên BTC đẩy token website sang ForcAD:

```powershell
cd MekoDataCTF_Website
$env:FORCAD_ADMIN_PASSWORD = '<admin.password trong ForcAD-demo/config.yml>'
npm run sync:forcad                # xem kế hoạch, không ghi gì
npm run sync:forcad -- --apply     # ghi token sang ForcAD
```

- Mỗi đội website được ghép với đội ForcAD đang hoạt động có cùng tên, hoặc theo **Tên đội trên ForcAD** (vd. `team01`). Script báo đội nào chưa ghép được, đội nào đã khớp, và từ chối nếu một token đã thuộc đội ForcAD khác.
- Biến môi trường: `FORCAD_URL` (mặc định `http://127.0.0.1:18080`), `FORCAD_ADMIN_USER` (mặc định `forcad`), `FORCAD_ADMIN_PASSWORD` (bắt buộc), `DB_FILE` (tùy chọn).
- **Chạy lại** sau khi: tạo đội mới trên ForcAD, BTC cấp token mới cho đội, hoặc round1 "tái tạo" (ForcAD sinh lại token khi tái tạo).
- Cần bản ForcAD đã sửa `update_team` (`ForcAD-demo/backend/lib/storage/teams.py`): khi đổi token, ForcAD gỡ token cũ khỏi Redis ngay. Bản cũ để token cũ vẫn nộp flag được cho tới khi Redis khởi động lại.

## World Arena / ForcAD

Chạy ForcAD trước, rồi `npm start` website và mở `http://localhost:3000/scoreboard`. `FORCAD_URL` mặc định là `http://127.0.0.1:18080`. Website cần chạy trên máy truy cập được ForcAD.

### Dữ liệu trực tiếp
- `services/arenaService.js` gom `tick-status`, `teams`, `arena` của ForcAD thành **một** trạng thái dùng chung cho mọi người xem: cache 1,5 giây, gộp các yêu cầu đồng thời, danh sách đội cache 30 giây. Số người xem không làm tăng số lần gọi ForcAD.
- `GET /scoreboard/stream` — Server-Sent Events: máy chủ hỏi ForcAD mỗi 2 giây **chỉ khi có người xem**, đẩy `event: state` ngay khi dữ liệu đổi và `event: ping` mỗi 15 giây (đồng bộ đồng hồ). Tối đa 500 kết nối.
- `GET /scoreboard/state` — JSON cùng nội dung, có `ETag` (trả 304 khi không đổi). `public/js/arena.js` tự chuyển sang cách này nếu SSE lỗi liên tiếp; tab ẩn thì hỏi thưa hơn.
- Mỗi gói có `now` (giờ máy chủ) để đồng hồ đếm ngược khớp hạn tick dù đồng hồ máy người xem lệch.
- Chỉ chuyển tiếp danh sách trường công khai cố định; không trả flag, token hay dữ liệu checker riêng. `/scoreboard/data/{tick-status,teams,arena}` vẫn giữ để tương thích.
- Nộp flag qua `POST /scoreboard/submit` (AJAX, CSRF của website), server chuyển tiếp tới PUT `/flags/` của ForcAD. Token chỉ nằm trong input và body/header.

### Bản đồ & linh thú
- **Nền 4K dựng sẵn**: `views/partials/map-terrain.ejs` (hình học trong `config/arenaMap.js`) được dựng thành `public/images/map/terrain-{1280,1920,2560,3840}.jpg` và `sea-mask.png` bằng `npm run bake:map` (dev: `@resvg/resvg-js`, `jpeg-js`). Trình duyệt chọn ảnh theo kích thước × mật độ điểm ảnh; không còn bộ lọc SVG nặng chạy lúc xem. Chỉ cần bake lại khi đổi hình học bản đồ.
- Lớp động phía trên: sóng và lấp lánh (che phần đất bằng `sea-mask.png`), tia nắng, mây, radar, lãnh thổ từng đội, căn cứ, đạn.
- **12 con giáp Việt Nam** (`config/zodiac.js`, ảnh `public/images/zodiac/`, Microsoft Fluent Emoji 3D — MIT, xem `LICENSE.txt` trong thư mục ảnh): Tý–Chuột, Sửu–Trâu, Dần–Hổ, Mão–Mèo, Thìn–Rồng, Tỵ–Rắn, Ngọ–Ngựa, Mùi–Dê, Thân–Khỉ, Dậu–Gà, Tuất–Chó, Hợi–Lợn.
- Gán con giáp **ngẫu nhiên nhưng cố định cả giải**: seed tạo lần đầu và lưu ở bảng `settings` (khóa `arena_zodiac_seed`); đội xếp theo id nhận lần lượt con giáp trong hoán vị, tối đa 12 con khác nhau. Muốn bốc thăm lại: xóa khóa này rồi restart website.
- Mỗi con có kiểu cử động riêng (nhảy, dậm chân, rình, vươn vai, bay lượn, trườn, chồm vó, gặm cỏ, mổ, vẫy) lệch nhịp ngẫu nhiên. Khi tấn công: quay về mục tiêu, lấy đà, lao tới; trúng thì nhào lộn ăn mừng + pháo giấy, đội bị trúng bật lùi chớp đỏ; bị chặn thì khiên lóe sáng, đội phòng thủ thủ thế. DOWN: nằm nghiêng, xám, bốc khói.
- 16 vùng đất (`SLOTS`); trên 8 đội tự thu nhỏ linh thú/lãnh thổ. Vùng trống hiện cờ chờ đội mới.
- Nút **Hiệu ứng động** (mặc định theo `prefers-reduced-motion`, nhớ lựa chọn); tab ẩn thì tạm dừng mọi chuyển động.
- Bản đồ chỉ dành cho desktop/máy chiếu: `.arena.war{min-width:1080px}`, không có bố cục riêng cho điện thoại.

### Backend ForcAD liên quan
`ForcAD-demo/backend/services/api/views.py` cung cấp `/api/client/arena/` chỉ đọc (TeamTasks, StolenFlags/Flags, MekodataSLA). Feed `defends` (nộp flag bị chặn) là tùy chọn: nếu ForcAD trả thì bản đồ bắn đạn bị khiên chặn. Áp dụng backend bằng `docker compose up -d --no-deps client-api` trong `ForcAD-demo`, không cần reset cuộc thi.
