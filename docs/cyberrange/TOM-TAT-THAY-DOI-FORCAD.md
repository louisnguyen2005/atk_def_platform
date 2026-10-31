# Tóm tắt các thay đổi trong phiên làm việc

Ngày tổng hợp: 28/10/2026

Tài liệu này ghi lại các thay đổi đã thực hiện cho bản demo ForcAD/CyberRange trong thư mục `ForcAD-demo`, cùng các kiểm tra và thao tác triển khai đã làm. Các file khác trong workspace (MekoDataCTF, hồ sơ luận văn, các bản preview) không thuộc phạm vi thay đổi được liệt kê ở đây.

## 1. Checker và chấm điểm dịch vụ theo tick

| File | Thay đổi |
|---|---|
| `ForcAD-demo/collect_checker.py` | Chuyển collector từ đọc snapshot SQLite theo chu kỳ thành chờ yêu cầu tick từ ForcAD. Khi nhận yêu cầu mới, SSH vào máy checker CyberRange và gọi checker chạy ngay; xác thực đủ 4 đội, cycle và timestamp; ghi phản hồi theo `request_id` bằng thao tác ghi file nguyên tử. Thêm khóa để ngăn chạy đồng thời nhiều collector trên Windows. |
| `ForcAD-demo/checkers/mekodata_bridge/bridge.py` | Adapter của ForcAD chờ phản hồi đúng `request_id` và tick được giao; từ chối dữ liệu cũ, sai tick hoặc sai định dạng. Trả UP, DOWN hoặc lỗi checker để ForcAD phân biệt dịch vụ down với không lấy được kết quả. |
| `ForcAD-demo/backend/services/ticker/hooks/classic_round.py` | Khi đến hạn tick, tạo yêu cầu checker mới có mã ngẫu nhiên, số tick và thời điểm yêu cầu; gửi tác vụ check cho các đội. |
| `ForcAD-demo/backend/services/ticker/__main__.py` | Khi bắt đầu hoặc tiếp tục cuộc thi, đặt lại mốc lịch để tick đầu tiên chờ đủ 60 giây; không chấm ngay lúc bấm Bắt đầu. |
| `ForcAD-demo/backend/lib/helpers/checkers.py` | Truyền số tick vào adapter checker riêng của sandbox, giữ cách gọi checker chung cho các bài khác. |
| `ForcAD-demo/backend/services/tasks/actions.py` | Truyền số tick hiện tại vào checker khi chạy hành động CHECK. |
| `ForcAD-demo/backend/lib/storage/tasks.py` | Ghi nhận điểm mỗi tick: UP +1, DOWN +0; từ chối cycle bị tái sử dụng và kết quả không đúng định dạng; đảm bảo một kết quả cho mỗi đội/bài/tick. |
| `ForcAD-demo/backend/services/api/views.py` | Thêm API cung cấp tick hiện tại, trạng thái chạy, điểm theo round và số kết quả cần kiểm tra cho scoreboard. |
| `ForcAD-demo/front/dist/tick-display.js` | Hiển thị Round 1/2, tick hiện tại, trạng thái chạy/dừng, điểm round và tổng điểm tối đa 30. |
| `ForcAD-demo/docker-compose-base.yml` | Gắn thư mục `checkers` vào container ticker để ticker ghi yêu cầu và worker/collector adapter đọc chung các file cầu nối. |
| `HUONG-DAN-CYBERRANGE-FORCAD.md` | Bổ sung quy trình tick 60 giây, cách collector hoạt động, hành vi khi lỗi checker và lưu ý chỉ chạy một collector. |

## 2. Điều khiển round và reset demo

| File | Thay đổi |
|---|---|
| `ForcAD-demo/backend/lib/storage/round_control.py` | Tạo trạng thái điều khiển chạy/dừng trong PostgreSQL; tạo bảng lưu kết quả điểm từng tick; giới hạn trận ở 30 tick; thêm reset an toàn cho demo health-only, có kiểm tra round đã dừng, hàng đợi/worker yên và không có flag trước khi xóa điểm. |
| `ForcAD-demo/backend/services/admin/viewsets/round_control.py` | Thêm API quản trị xác thực để đọc trạng thái, bắt đầu/dừng và reset có xác nhận. |
| `ForcAD-demo/backend/services/admin/viewsets/__init__.py` | Đăng ký các route điều khiển round với API admin. |
| `ForcAD-demo/front/dist/round-control.js` | Thêm bảng điều khiển cho quản trị trên scoreboard: bắt đầu, dừng, reset; yêu cầu đăng nhập quản trị và xác nhận reset. |
| `ForcAD-demo/BAT-ROUND.bat` | Mở scoreboard để quản trị bắt đầu round. |
| `ForcAD-demo/DUNG-ROUND.bat` | Mở scoreboard để quản trị dừng round. |
| `ForcAD-demo/TRANG-THAI-ROUND.bat` | Mở scoreboard để xem trạng thái round. |

Reset chỉ dành cho bản demo không có flags và có điều kiện bảo vệ; không phải chức năng xóa tùy ý mọi dữ liệu thi ForcAD.

## 3. Cấu hình demo và tài liệu dự án

| File | Thay đổi |
|---|---|
| `ForcAD-demo/config.yml` | Cấu hình demo đội và bài checker sức khỏe web; bài sandbox dùng adapter riêng, không tạo PUT/GET flag. Đây là file cấu hình cục bộ và có thể chứa thông tin đăng nhập/secret; không chia sẻ công khai. |
| `ForcAD-demo/configure_mekodata_demo.py` | Script đăng ký bốn đội và bài health-only thông qua API admin, tắt các đội/bài mẫu của ForcAD trong demo. |
| `ForcAD-demo/prepare_local_demo.py` | Script chuẩn bị dữ liệu/thiết lập bản demo cục bộ. |
| `ForcAD-demo/control.py` | Tiện ích điều khiển demo từ command line. |
| `ForcAD-demo/README.md` | Hướng dẫn cài đặt và chạy ForcAD được giữ trong thư mục dự án; phần mô tả checker mới được bổ sung vào tài liệu CyberRange bên ngoài. |
| `GIAI-THICH-LUONG-CYBERRANGE-FORCAD.md` | Tài liệu giải thích luồng máy checker CyberRange → SSH collector Windows → ForcAD/scoreboard. |
| `ForcAD-demo/apply_health_points.sql` | SQL hỗ trợ cấu hình phần điểm health-only cho bản demo. |

## 4. Kiểm tra và triển khai đã thực hiện

- Build lại các image `ticker`, `celery`, `client-api`, `admin-api`, `nginx` bằng Docker Compose.
- Sao lưu PostgreSQL trước khi áp dụng sửa, tạo file `ForcAD-demo/forcad-before-checker-fix.dump`.
- Cập nhật `checker_timeout` của bài sandbox lên 30 giây để đủ thời gian chờ kết quả SSH mới.
- Khởi động lại các container cần thay đổi. Cuộc thi vẫn đang dừng ở tick 5 và các điểm hiện có được giữ nguyên.
- Thay hai collector đồng thời bằng một collector chạy nền trên Windows.
- Kiểm tra lịch tick: không đến hạn ở giây 0 hoặc giây 59; đến giây 60 thì đến hạn.
- Kiểm tra thực tế: dừng tạm web team02 thì checker/adapter báo DOWN; bật lại thì báo UP. Service đã được khôi phục và hai lần kiểm tra không ghi điểm vào cuộc thi.
- Kiểm tra adapter từ chối yêu cầu tick không khớp; kiểm tra cú pháp Python cho các file nguồn liên quan.

## 5. Những phần chưa được thay đổi

- Công thức điểm **attack bằng flag** của ForcAD không bị sửa. Nó vẫn ở `ForcAD-demo/backend/scripts/create_functions.sql` và dùng hàm PostgreSQL `recalculate_rating`.
- Chưa triển khai sinh flag động/đặt flag vào dịch vụ sandbox; bài health hiện cấu hình `puts=0`, `gets=0`. Do đó ví dụ điểm attack mới chỉ mô tả khả năng sẵn có của ForcAD, chưa phải luồng attack đang chạy cho sandbox.
- Chưa chạy trọn một tick 60 giây của cuộc thi đang dùng để tránh tự ý làm tăng/ghi thêm điểm. Các chuyển trạng thái UP/DOWN được xác minh qua checker và adapter riêng.

## 6. File vận hành được tạo trong lúc triển khai

- `ForcAD-demo/collector.log` và `ForcAD-demo/collector-error.log`: log collector; có thể chứa lỗi SSH/kết nối.
- `ForcAD-demo/forcad-before-checker-fix.dump`: bản sao lưu database trước lần sửa này.
- `ForcAD-demo/config_backup_1793090224.yml`: bản sao lưu cấu hình cục bộ.
- `pool101-management-config` và `pool101-known-hosts` ở thư mục workspace cha: cấu hình SSH và known-hosts phục vụ kết nối CyberRange; đây là file vận hành nhạy cảm, không đưa lên Git công khai.

Các file này ghi lại dữ liệu vận hành, không phải tất cả đều cần commit vào repository. Đặc biệt, không commit file cấu hình SSH, known-hosts, file cấu hình có credential hoặc database dump lên repository công khai.


## 7. Cập nhật triển khai Round 1 ba task (28/10/2026)

Phần này cập nhật trạng thái mới nhất, thay thế các nhận định phía trên rằng chưa có PUT/GET và chưa có task flag.

| File/nhóm file | Thay đổi mới |
|---|---|
| `round1-lab/webservice.py` | Web lab chứa IDOR, SQLi và lỗi upload ZIP/symlink đọc file trong dữ liệu lab; mỗi task có SQLite riêng; có PUT quản trị được xác thực và đường đọc hợp lệ theo owner. |
| `round1-lab/agent.py` | Agent trên máy checker, nhận yêu cầu cấu trúc qua SSH và thực hiện CHECK/PUT/GET tới VM đội. |
| `round1-lab/deploy.py` | Cài ứng dụng, agent, token riêng từng đội và drop-in systemd; cấp user-access quyền sửa source/restart đúng service lab. |
| `round1-lab/README.md` | Hướng dẫn vận hành, thiết kế flag, quyền phòng thủ, kiểm thử và hoàn tác webservice. |
| `round1-lab/test_round1.py`, `round1-lab/run_tests.py` | Kiểm thử HTTP ba lỗi/vá lỗi và lifecycle 15 tick trên PostgreSQL/Redis dùng riêng. |
| `ForcAD-demo/checkers/round1/common.py` | Cầu nối checker native ForcAD bằng RPC file có mã yêu cầu và thời hạn. |
| `ForcAD-demo/checkers/round1/idor.py`, `sqli.py`, `upload.py`, `health.py` | Entry point CHECK/PUT/GET cho ba task và kiểm tra kết nối. |
| `ForcAD-demo/collect_checker.py` | Thêm xử lý các yêu cầu RPC song song qua agent SSH, bên cạnh đường health cũ. |
| `ForcAD-demo/backend/lib/storage/round1.py` | Chuẩn bị ba task; điều phối đặt flag/mở tick 60 giây/xác minh; lưu seed chống sinh trùng; chấm SLA một lần mỗi đội; fixed attack +1/defense -1; pause/resume và kết thúc sau 15 tick +120 giây nhận flag. |
| `ForcAD-demo/backend/lib/storage/round_control.py` | Nhận biết chế độ round1; cho phép ba task; không tự xóa dữ liệu thi có flag bằng reset health. |
| `ForcAD-demo/backend/services/ticker/__main__.py` | Chuyển sang bộ điều phối round1 khi đã chuẩn bị; khởi động container luôn giữ gate dừng. |
| `ForcAD-demo/backend/lib/storage/attacks.py` | Giữ kiểm tra flag của ForcAD, chuyển các bài nộp round1 sang điểm cố định và xử lý trùng nguyên tử trên bảng StolenFlags. |
| `ForcAD-demo/backend/lib/storage/utils.py` | Chuyển pool PostgreSQL sang ThreadedConnectionPool cho các checker chạy song song. |
| `ForcAD-demo/backend/services/admin/viewsets/round_control.py`, `__init__.py` | API admin chuẩn bị round1 và báo trạng thái. |
| `ForcAD-demo/backend/services/api/views.py` | API bảng điểm Attack, Defense, SLA, tổng và trạng thái round1. |
| `ForcAD-demo/front/dist/round-control.js`, `tick-display.js` | Nút chuẩn bị round1, điều khiển start/stop và bảng điểm mới. |
| `ForcAD-demo/front/dist/submit.html` | Trang nộp flag bằng team token và xem ID/path mục tiêu công khai. |
| `ForcAD-demo/backend/scripts/setup_round1.py` | Cài schema, không tạo flag hay bắt đầu thi. |
| `ForcAD-demo/.gitignore`, `.dockerignore`, `round1-lab/.gitignore` | Theo dõi source checker mới, loại các file runtime/secret khỏi Git/build context. |

Đã triển khai web lab trên attacker1–4 và agent trên checker. Đã build/áp dụng API, ticker, worker và nginx. Đã chuẩn bị ba task qua API quản trị. Xác nhận cuối: round1 configured=true, phase=ready, tick=0, gate=false, Flags=0; chỉ bấm Bắt đầu trên dashboard mới sinh và đặt flag.

Kiểm thử: 5 test đều pass. Có mô phỏng đủ 15 tick và 180 flag duy nhất trong database/container tách biệt, kiểm tra pause/resume, nộp trùng/own flag/hết hạn, điểm cố định và phục hồi sau gián đoạn lưu SQL/cache. Luồng thực tế Docker → collector → SSH → checker → bốn VM đã kiểm chứng bằng CHECK, không tạo flag ở môi trường thi. Chưa chạy một cuộc thi thật đủ 15 phút.

Đã sao lưu database trước triển khai vào `ForcAD-demo/forcad-before-round1.dump`. Token riêng của lab được lưu ở `round1-lab/.secrets/teams.json`, không công khai hoặc commit file này.

## 8. Đổi mỗi tick thành 120 giây (28/10/2026)

- `ForcAD-demo/backend/lib/storage/round1.py`: thời lượng cấu hình 120 giây; SLA/flag kiểm tra sau tick; giai đoạn nhận flag cuối round tăng lên 240 giây; cache expiration lấy theo thời lượng hiện tại.
- `ForcAD-demo/backend/services/api/views.py` và `ForcAD-demo/front/dist/tick-display.js`: dashboard API/UI hiển thị thời lượng tick.
- `round1-lab/test_round1.py` và `round1-lab/README.md`: kiểm thử và hướng dẫn cập nhật theo 120 giây.
- Đã cập nhật trận đang dừng tại tick 9: thời lượng cấu hình 120 giây, phần còn lại của tick được tăng 60 giây (giữ 8.8 giây đang còn); điểm, flag và tick giữ nguyên. Làm mới cache flag để áp dụng TTL mới.
- Build và khởi động lại ticker, client API, nginx. Kiểm thử riêng: 5/5 pass. Cuộc thi vẫn dừng, không sinh flag mới.

## 9. Thiết kế lại bảng điểm ForcAD (giao diện quản trị)

Bảng điểm mà ban tổ chức xem ở `http://127.0.0.1:18080/admin/` là ứng dụng Vue trong `ForcAD-demo/front/`. Trang `/` công khai không dùng bảng này: `front/public/tick-display.js` gắn class `arena-admin` vào `body` và `arena.css` ẩn `#app`, thay bằng panel "Live arena" riêng.

| File | Thay đổi |
|---|---|
| `front/src/config/index.js` | Thay `statusColors` bằng `statusTheme` (mỗi trạng thái có màu nhấn + nền pha loãng cho giao diện tối); màu huy hiệu hạng 1–3. |
| `front/src/utils/colors.js` | Thay `getTeamRowBackground`/`getTeamTaskBackground` bằng `getRankColor`, `getStatusAccent`, `getStatusBackground`. |
| `front/src/assets/table.scss` | Token màu dùng chung (`--bg`, `--panel`, `--line`, `--text`, `--accent-teal`, `--mono`, `--sans`) và khung lưới CSS Grid của bảng; bỏ bố cục flex cũ. |
| `front/src/components/Lib/ScoreTable.vue` | Mỗi đội là một thẻ: huy hiệu hạng, tên + IP, tổng điểm (font mono). Mỗi dịch vụ là một ô có viền trái theo màu trạng thái, nhãn trạng thái, SLA kèm thanh tiến độ, điểm và số flag cướp/mất. Nút sửa và nút xem thông báo checker chỉ hiện khi rê chuột. |
| `front/src/components/General/Statuses.vue` | Chú giải trạng thái dạng chip tròn thay cho dải màu đặc. |
| `front/src/components/General/Topbar.vue` | Thanh trên có tên giải, tick tổng và tiến độ tick chạy nền. |
| `front/src/views/AdminScoreboard.vue` | Thêm tiêu đề trang và nút "Thêm dịch vụ" / "Thêm đội"; hiện cả chú giải trạng thái. |
| `front/src/components/Scores/TeamScoreboard.vue`, `front/src/components/Admin/TeamTaskLog.vue` | Dùng chung bảng màu mới; log checker chuyển thành bảng có hàng tiêu đề dính. |
| `front/src/App.vue`, `front/src/components/Lib/Container.vue` | Nền tối, font Inter + JetBrains Mono, `box-sizing: border-box`, bề ngang tối đa 1680px. |

### Build lại được

Trước đây `front/dist` chứa các file tự thêm (`arena.css`, `arena.js`, `round-control.js`, `tick-display.js`, `submit.html`) và một `index.html` đã sửa tay — chạy `npm run build` sẽ xóa mất chúng. Nay:

- Các file đó nằm ở `front/public/`, Vite tự chép sang `dist` khi build.
- `front/index.html` (đầu vào của Vite) đã có sẵn tiêu đề, `arena.css` và hai thẻ script.

```powershell
cd ForcAD-demo\front
npm install
npm run build
```

Sau khi build, nạp lại bundle cho nginx trong thư mục `ForcAD-demo`:

```powershell
docker compose up -d --no-deps nginx
```

Chỉ sửa giao diện nên không cần reset cuộc thi hay build lại backend. Đã kiểm thử giao diện bằng một ForcAD giả lập cục bộ (6 đội, 4 dịch vụ, đủ 5 trạng thái); chưa chạy với ForcAD thật.

## 10. Token đội do website cấp (đăng nhập thành viên & nộp flag)

Website MekoDataCTF cấp token đội khi đội trưởng tạo đội; thành viên đăng nhập và nộp flag bằng token đó (chi tiết ở README website, mục "Token đội"). Để ForcAD cộng điểm đúng đội, token website được đẩy sang ForcAD bằng `npm run sync:forcad -- --apply`.

| File | Thay đổi |
|---|---|
| `ForcAD-demo/backend/lib/storage/teams.py` | `update_team` đọc token cũ trước khi cập nhật; sau khi commit thì xóa khóa Redis `team:token:<token cũ>` và ghi ngay khóa token mới. Đội bị đặt `active=false` qua cập nhật cũng bị gỡ khóa token. |

Lỗi đã sửa: `flush_teams_cache` chỉ xóa tập `teams`, không xóa khóa `team:token:*`, mà bộ nhận flag tra đội bằng chính khóa này. Vì vậy trước đây đổi token đội qua API quản trị thì **token cũ vẫn nộp flag được** cho tới khi Redis khởi động lại, còn token mới chỉ dùng được sau khi cache đội được dựng lại.

Kiểm thử: unit test giả lập DB/Redis cho `update_team` (token mới dùng được, token cũ bị từ chối, giữ nguyên token vẫn dùng được, đội ngừng hoạt động bị từ chối) — 3/3 đạt với bản sửa, 2/3 thất bại với bản cũ. Chưa chạy trên ForcAD thật (Docker Desktop đang tắt). `update_team` chỉ được gọi từ API quản trị, nên chỉ cần build lại và khởi động lại container `admin-api` (`docker compose build admin-api` rồi `docker compose up -d --no-deps admin-api` trong `ForcAD-demo`) trước khi chạy đồng bộ token.

Sau khi round1 "tái tạo", ForcAD sinh lại token đội (`round1.py`), nên phải chạy lại `npm run sync:forcad -- --apply` để người chơi tiếp tục dùng token cũ của website.
