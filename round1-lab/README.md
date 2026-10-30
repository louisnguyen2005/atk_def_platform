# Round 1 — IDOR, SQLi và Upload File trên CyberRange

## Thiết kế

- Bốn đội: `10.80.0.11`–`10.80.0.14`, webservice cổng 80.
- Ba task dùng chung webservice, mỗi task một flag mới/đội/tick. Tổng 180 flag sau 15 tick thành công.
- ForcAD sinh flag bằng `Flag.generate`, lưu flag đặt thành công bằng `storage.flags.add_flag`, dùng bảng `Flags`, `StolenFlags`, xác minh bài nộp và protocol checker có sẵn.
- Bộ điều phối Round 1 thay lịch health-only: đặt đủ 12 flag, mở cửa thi 120 giây, xác minh chức năng và các flag còn hiệu lực, chấm SLA một lần/đội rồi mở tick sau. Thời gian chuẩn bị/xác minh là khoảng chuyển tick, không tính vào 120 giây làm bài.
- Flag có hiệu lực ở tick tạo và hai tick tiếp theo. Sau tick 15 có 240 giây nhận flag cuối round, không sinh flag mới. Round 2 chưa được tự kích hoạt.
- Attack +1 khi nộp flag hợp lệ; Defense -1 cho đội mất flag; SLA +1 nếu cả ba chức năng và các flag cần kiểm tra đều còn đúng. Tổng = Attack + Defense + SLA. Defense/tổng được phép âm.
- Một đội được nộp một flag của đội khác một lần. Ba đội khác nhau nộp cùng một flag tạo ba lần cộng/trừ điểm.

## Các lỗi lab

| Task | Lỗi được cài | Đường truy cập hợp lệ của checker |
|---|---|---|
| IDOR | `/api/scores/<id>` thiếu kiểm tra chủ sở hữu | Cùng route với `X-Owner-Token` đúng |
| SQLi | `/api/search?q=...` nối trực tiếp chuỗi truy vấn | `/api/notes/<id>` với token chủ sở hữu |
| Upload | Giải nén ZIP chấp nhận symlink; `/uploads/<name>` đi theo symlink đến file flag | `/api/vault/<id>` với token chủ sở hữu |

Upload ở bản này là lỗi xử lý ZIP/symlink dẫn tới đọc file trong dữ liệu lab. Không cài thực thi mã hệ điều hành. Mỗi task có SQLite riêng để SQLi không tự đọc bảng flag IDOR. Token quản trị riêng từng VM nằm ở `/etc/round1/web.json`; bộ token chung chỉ nằm trên máy checker `/etc/round1/agent.json` và bản local `.secrets/teams.json` (không commit).

## Khởi chạy từ dashboard

1. Mở `http://127.0.0.1:18080/` và đăng nhập quản trị.
2. Nếu bản health cũ còn tick/điểm, bấm Dừng, đợi worker hoàn tất, rồi dùng Reset cũ về tick 0. Hệ thống không tự xóa dữ liệu cuộc thi có flag.
3. Bấm **Chuẩn bị Round 1 (3 task)**. Hành động này tạo task, bật ba task round 1 và tắt bài mẫu/health cũ; chưa sinh flag.
4. Bấm **Bắt đầu**. Hệ thống mới sinh và đặt flag. Đồng hồ 120 giây bắt đầu khi tất cả PUT đã thành công; chưa cộng SLA khi mở tick.
5. **Dừng** khóa nộp flag và tạm dừng đồng hồ. Tác vụ SSH đã gửi có thể hoàn tất, nhưng không tự chuyển sang tick mới. Bấm Bắt đầu để tiếp tục.
6. Sau 15 tick và 240 giây nhận flag, hệ thống dừng. Nút reset health bị khóa đối với cuộc thi đã bật chế độ flag.

Dashboard hiển thị cột Attack, Defense, SLA / 15 và Tổng điểm. Trang `/submit.html` cho phép nộp flag bằng team token và xem ID/path mục tiêu. Team token lấy từ phần quản trị đội; không dùng token quản trị web lab để nộp flag.

## Thành phần phải chạy

- Docker Compose ForcAD: ticker, PostgreSQL, Redis, RabbitMQ, API và scoreboard.
- Một collector Windows: từ thư mục `ForcAD-demo`, chạy `python collect_checker.py`.
- Webservice `attacker-http@attacker1` … `attacker-http@attacker4` trên bốn VM.
- SSH management tới máy checker, có `/opt/round1/agent.py`.

Collector truyền dữ liệu cấu trúc qua SSH stdin, không ghép flag vào câu lệnh shell. Các yêu cầu có mã riêng và thời hạn; không lấy snapshot cũ để thay kết quả PUT/GET.

## Cài lại lên sandbox mới

Từ workspace cha, dùng SSH management đúng sandbox:

```powershell
python round1-lab/deploy.py --apply
```

Lệnh này cài web lab và agent, không tạo flag. Các file service ban đầu được giữ; deployment dùng drop-in systemd `attacker-http@<node>.service.d/round1.conf`. Các lỗi chỉ được dựng trong ứng dụng, không tự bật lại lỗi sau khi đội vá hoặc tự sửa đè source mỗi tick.

Sau khi build backend mới, cài schema bằng `python /app/scripts/setup_round1.py` trong container ticker. Chuẩn bị và bắt đầu bằng dashboard.

## Vá lỗi để thử phòng thủ

Trong `/etc/round1/web.json` của VM đội, đặt `patched.idor`, `patched.sqli` hoặc `patched.upload` thành `true`, rồi restart service tương ứng bằng quyền quản trị. Đây là cách vá mẫu; đội chơi có thể sửa source để kiểm tra quyền, dùng truy vấn tham số và từ chối symlink. GET/PUT của checker phải vẫn thành công sau khi vá.

Tài khoản `user-access` trên VM được quyền sửa `/opt/round1/webservice.py` và restart đúng service của VM đó bằng `sudo systemctl restart attacker-http@attackerN`. Quyền này được giới hạn vào service lab; không cấp sudo toàn máy. Cấu hình `/etc/round1/web.json` vẫn cần quyền quản trị. Người chơi có thể vá trực tiếp source rồi restart service bằng quyền đã cấp.

## Kiểm chứng

```powershell
python round1-lab/run_tests.py
```

Bộ kiểm thử tạo database PostgreSQL và container Redis tạm riêng; không dùng database cuộc thi để chạy thử. Kiểm tra khai thác/vá ba lỗi qua HTTP, PUT có xác thực và idempotency, không sinh flag trước start, đủ 180 flag duy nhất sau 15 tick, cộng SLA sau 120 giây, dừng/tiếp tục, nộp trùng/flag của chính đội/flag hết hạn và điểm cố định. Lịch 15 tick được kiểm thử bằng đồng hồ giả lập; chưa chạy thi thật 30 phút.

## Hoàn tác webservice

Trên từng VM, xóa đúng file drop-in `/etc/systemd/system/attacker-http@attackerN.service.d/round1.conf`, chạy `systemctl daemon-reload`, rồi restart service. Thao tác này trả về chương trình HTTP ban đầu, không xóa dữ liệu ở `/var/lib/round1-web`.

## Thời lượng tick hiện tại

Mỗi tick kéo dài **120 giây**. Sau tick 15, hệ thống nhận flag thêm **240 giây** rồi tự dừng. Cập nhật ngày 28/10/2026 khi đang tạm dừng tại tick 9: giữ nguyên điểm và flag; cộng thêm 60 giây vào phần thời gian còn lại để tick hiện tại cũng đủ 120 giây.

## Đóng cuộc thi và tái tạo cho lần thi mới

Quy trình này dành cho việc dùng lại cùng bốn VM cho một cuộc thi Round 1 mới. Round 2 chưa được cấu hình. **Đóng/lưu hồ sơ** và **tái tạo** là hai bước khác nhau: đóng chỉ khóa cuộc thi và chụp dữ liệu; tái tạo mới xóa flag/điểm đang hoạt động sau khi lab VM đã được kiểm tra.

### Cập nhật mã nguồn trước lần triển khai đầu

Các thay đổi cần được build vào container trước khi nút mới xuất hiện. Trong PowerShell, vào `ForcAD-demo`:

```powershell
docker compose build ticker admin-api http-receiver nginx
docker compose up -d ticker admin-api http-receiver nginx
docker compose exec ticker python /app/scripts/setup_round1.py
```

Các lệnh này build và khởi động lại dịch vụ ứng dụng; không chạy `control.py reset`, `docker compose down -v`, hoặc xóa `docker_volumes/postgres/data`, vì chúng xóa database và hồ sơ lưu. Sau đó tải lại dashboard.

### 1. Chốt kết quả và lưu hồ sơ

1. Trên dashboard, bấm **Dừng**. Đợi trạng thái thành `paused` hoặc round tự chuyển `finished`; không lưu khi dashboard còn `preparing`, `checking` hay `draining`.
2. Bấm **Đóng và lưu hồ sơ**. ForcAD ghi snapshot bất biến vào bảng `MekodataArchives` trong PostgreSQL và khóa nút bắt đầu.
3. Bấm **Tải hồ sơ JSON** và lưu file ngoài workspace/ổ đĩa Docker. Snapshot gồm kết quả đội, token, flag, lịch sử nộp và cấu hình; coi file này là dữ liệu nhạy cảm, giữ riêng tư và không đưa lên Git.
4. Ghi lại archive ID hiện trên dashboard. Không bấm reset health để thay cho bước này.

Nếu bước tái tạo bị gián đoạn, hồ sơ cũ vẫn còn trong PostgreSQL; script dừng trước khi xóa trạng thái tính điểm nếu không kiểm tra sạch được tất cả VM. Việc reset dữ liệu web trên VM có tính lặp an toàn; sửa lỗi kết nối rồi chạy lại **đúng archive ID đó**.

### 2. Tái tạo bốn VM và ForcAD

Mở PowerShell trong workspace gốc, nơi có `ForcAD-demo`, `round1-lab` và `pool101-management-config`. Bảo đảm Docker Compose ForcAD đang chạy, management SSH truy cập được tới `attacker1`–`attacker4` và `checker`, và file token riêng `round1-lab/.secrets/teams.json` còn nguyên. Không cần tự đăng nhập/SSH thủ công từng máy.

```powershell
python round1-lab/recycle.py --archive-id <UUID-tren-dashboard>
```

Script yêu cầu đăng nhập admin ForcAD, kiểm tra archive ID, yêu cầu gõ `RECREATE`, rồi cài lại source lab và đặt `patched` về false trên mỗi VM đội. Nó xóa **chỉ** `/var/lib/round1-web` trên bốn VM đội, nên SQLite lab, file flag và upload của cuộc thi cũ bị dọn; không xóa dữ liệu service ở đường dẫn khác. Sau đó checker gọi `/health` từng VM. Chỉ khi cả bốn trả health hợp lệ script mới yêu cầu ForcAD reset `Flags`, `StolenFlags`, kết quả/tick/SLA, log và điểm trong transaction. Snapshot được giữ trong PostgreSQL và JSON backup. Tên/IP đội được giữ, nhưng **ForcAD team token được tạo mới**; sau đó lấy token mới trong phần quản trị đội và cấp cho người chơi. Token quản trị web lab của từng VM không đổi để checker tiếp tục hoạt động. Nếu thiếu token lab hoặc archive không khớp, script từ chối trước khi thay đổi VM. Nếu dashboard hiện `recreating` do mất kết nối trong bước cuối, chạy lại cùng lệnh và cùng archive ID để hoàn tất dọn cache.

### 3. Chuẩn bị cuộc thi kế tiếp

Sau thông báo **Đã tái tạo xong**, mở dashboard và kiểm tra điểm/tick về 0. Bấm **Chuẩn bị Round 1 (3 task)**; khi đã sẵn sàng mới bấm **Bắt đầu**. Lần bắt đầu mới sẽ sinh flag mới. Archive cũ vẫn nằm trong PostgreSQL và file JSON đã tải để tra cứu.

### Thận trọng

- Không chạy `recycle.py` khi còn muốn tiếp tục round vừa đóng; bước này chủ ý dọn dữ liệu web ở cả bốn VM và reset trạng thái thi đang dùng.
- Giữ backup JSON ngoài máy trước khi tái tạo; PostgreSQL trong Docker không thay thế bản backup ngoài.
- Không xóa `round1-lab/.secrets/teams.json`: các token này kết nối ForcAD với web lab và agent checker.
- Script chỉ kiểm tra kết nối tới bốn URL health; nó không kiểm tra thủ công từng lỗ hổng. Sau khi chuẩn bị round, có thể xác nhận checker PUT/GET hoạt động ở tick đầu.

## PUT retry trong tick

Tick mở ngay và chạy 120 giây dù tất cả service DOWN. Mỗi đội/task chỉ có một PUT đang xử lý. PUT thất bại được thử lại sau 10 giây kể từ khi nhận kết quả thất bại; PUT thành công không lặp lại trong tick. Nếu kết nối bị treo, phải đợi timeout của lượt trước trước khi thử lại. Đầu tick có thể chưa có vị trí mục tiêu; vị trí được cập nhật sau PUT thành công.

Hết 120 giây khóa nhận flag và ngừng lên lịch PUT. Hệ thống đợi các PUT đang xử lý kết thúc rồi kiểm tra cuối tick; kết quả PUT hết hạn hoặc khác tick không được ghi vào Flags. Khoảng chờ/chấm cuối tick là thời gian chuyển tiếp, không cộng vào thời gian làm bài và không chạy chồng sang tick kế tiếp. Service phục hồi và đủ ba task/flag cần kiểm tra hợp lệ vào cuối tick thì được +1 SLA.
