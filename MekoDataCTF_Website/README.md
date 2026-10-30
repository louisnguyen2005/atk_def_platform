# MekoDataCTF Website

Website giới thiệu và đăng ký thi MekoDataCTF — Node.js/Express, mô hình MVC, song ngữ Việt/Anh.

## Chức năng
- **Thí sinh**: đăng ký / đăng nhập bằng email; khai báo đội (tên đội, trường/khoa, SĐT, từng thành viên gồm họ tên + MSSV). Sửa được đến hạn đăng ký.
- **Ban tổ chức** (`/admin`): xem thống kê; sửa nội dung trang chủ (VI + EN); đặt hạn đăng ký, thời gian bắt đầu/kết thúc, số thành viên; bật/tắt đăng ký; tìm/xem/xóa đội; **xuất Excel (.xlsx) và CSV**.
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

## Ảnh nền
Lưu ảnh tòa ATL vào **`public/images/ctu-atl.jpg`** (khoảng 1920×1080). Khi chưa có ảnh, website dùng minh họa `public/images/ctu-atl.svg`.

## Cấu trúc MVC
```
app.js            khởi tạo Express, middleware, routes
config/           kết nối SQLite, schema, nội dung mặc định
models/           User, Team, Member, Setting, Content   (M)
views/            EJS: layouts, partials, home, auth, team, admin   (V)
controllers/      home, auth, team, admin   (C)
routes/           ánh xạ URL → controller
middlewares/      auth, i18n, csrf, locals
services/         exportService (xlsx/csv)
helpers/          định dạng nội dung, ngày giờ
locales/          vi.json, en.json
public/           css, js, images
scripts/seed.js   tạo tài khoản BTC
```
Dữ liệu lưu ở `data/mekodata.db` (SQLite).

## World Arena / ForcAD

Chạy ForcAD trước, rồi `npm start` website và mở `http://localhost:3000/scoreboard`. `FORCAD_URL` mặc định là `http://127.0.0.1:18080`. Website cần chạy trên máy truy cập được ForcAD.

Bản đồ SVG tĩnh được vẽ trong `views/scoreboard.ejs`: bốn căn cứ cố định đại diện team01–04, không thể hiện địa lý thật hay quyền kiểm soát. CSS/JS riêng nằm trong `public/css/world.css` và `public/js/world.js`. Bảng điểm và đồng hồ dùng các tài nguyên arena hiện có.

Nguồn dữ liệu: `/api/client/tick-status/` cho điểm/đồng hồ; `/api/client/arena/` là endpoint công khai bổ sung chỉ đọc, truy vấn TeamTasks, StolenFlags/Flags và MekodataSLA với danh sách trường cố định. Không trả giá trị flag, token hay private checker data. Các endpoint ForcAD hiện có được giữ nguyên. Website chỉ proxy endpoint cố định, không proxy admin/cookie.

Capture mới sau lần tải đầu mới tạo hiệu ứng ngắn; capture lịch sử chỉ hiện trong feed. Lịch sử SLA chỉ có đội/tick/trạng thái/điểm; database chưa lưu latency hoặc từng task trong bản ghi SLA. Không hiển thị dữ liệu suy diễn cho các trường đó.

Nộp flag qua `/scoreboard/submit` với CSRF của website; server chuyển tiếp tới PUT `/flags/` của ForcAD. Token chỉ nằm trong input và request body/header, không lưu browser storage hay URL. Nút xóa dọn input và kết quả. Không đổi luật chấm điểm hoặc tạo flag/capture khi mở trang.

Sau khi sửa route Express cần restart website. Backend bổ sung nằm ở `ForcAD-demo/backend/services/api/views.py`; compose gắn backend vào client-api, áp dụng bằng `docker compose up -d --no-deps client-api` trong thư mục ForcAD-demo. Không cần reset cuộc thi.

Các file thay đổi cho World Arena:
- `views/scoreboard.ejs`: bản đồ, huy hiệu, bảng điểm và form.
- `views/layouts/main.ejs`: tiêu đề/favicon trung tính và bỏ font ngoài ở trang game.
- `public/css/world.css`, `public/js/world.js`: địa hình, responsive, capture feed/hiệu ứng, trạng thái service, nộp flag.
- `public/js/arena.js`: đồng bộ dữ liệu điểm với bản đồ và trạng thái chưa chuẩn bị cuộc thi.
- `public/images/world.svg`: favicon nội bộ.
- `routes/scoreboard.js`, `app.js`: proxy chỉ đọc và POST nộp flag có CSRF; lỗi input không ghi payload vào log.
- `ForcAD-demo/backend/services/api/views.py`: thêm endpoint public arena chỉ trả trường cho phép.
- `ForcAD-demo/docker-compose.yml`: gắn backend cho client-api để chạy bản cập nhật.

Đã kiểm tra trực tiếp ở viewport 1280×900 và 390×844; bảng không tràn ngang. Kiểm tra HTTP thành công cho tick-status/arena, payload không có trường secret, invalid token bị từ chối và thiếu CSRF trả 403. Không nộp flag hợp lệ để tạo capture hay thay đổi điểm chỉ nhằm thử UI. Hiệu ứng capture nối với sự kiện mới; chưa phát sinh capture mới trong lần kiểm tra giao diện này.
